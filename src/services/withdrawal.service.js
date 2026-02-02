import mongoose from "mongoose";
import Withdrawal from "../models/Withdrawal.model.js";
import Account from "../models/Account.model.js";
import Transaction from "../models/Transaction.model.js";
import User from "../models/User.model.js";
import Trade from "../models/Trade.model.js";

/* -------------------- HELPERS -------------------- */

const parsePagination = (query) => {
  const pageRaw = Number(query.page);
  const limitRaw = Number(query.limit);

  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 10;

  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

const parseDateRange = (query) => {
  const from = typeof query.from === "string" ? new Date(query.from) : null;
  const to = typeof query.to === "string" ? new Date(query.to) : null;

  const fromValid = from instanceof Date && !Number.isNaN(from.getTime());
  const toValid = to instanceof Date && !Number.isNaN(to.getTime());

  return {
    from: fromValid ? from : null,
    to: toValid ? to : null,
  };
};

const buildFilter = ({ userId, query, isAdmin }) => {
  const filter = {};

  if (!isAdmin && userId) {
    filter.user = userId;
  }

  if (isAdmin && query.userId && mongoose.isValidObjectId(query.userId)) {
    filter.user = new mongoose.Types.ObjectId(query.userId);
  }

  if (query.accountId && mongoose.isValidObjectId(query.accountId)) {
    filter.account = new mongoose.Types.ObjectId(query.accountId);
  }

  if (query.status && typeof query.status === "string") {
    filter.status = query.status;
  }

  if (query.method && typeof query.method === "string") {
    filter.method = query.method;
  }

  const { from, to } = parseDateRange(query);

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }

  return filter;
};

const validatePayout = ({ method, payout }) => {
  if (!method) {
    return { ok: false, message: "Withdrawal method is required" };
  }

  if (!payout || typeof payout !== "object") {
    return { ok: false, message: "Payout details are required" };
  }

  if (method === "UPI") {
    if (!payout.upi_id || typeof payout.upi_id !== "string") {
      return { ok: false, message: "UPI ID is required" };
    }
  }

  if (method === "BANK") {
    if (
      !payout.bank_name ||
      !payout.account_holder_name ||
      !payout.account_number ||
      !payout.ifsc
    ) {
      return { ok: false, message: "Complete bank details are required" };
    }
  }

  if (method === "CRYPTO") {
    if (!payout.crypto_network || !payout.crypto_address) {
      return { ok: false, message: "Crypto network & address are required" };
    }
  }

  return { ok: true, message: "OK" };
};

/* -------------------- USER: CREATE WITHDRAWAL -------------------- */
/**
 * USER: CREATE WITHDRAWAL REQUEST
 * ✅ KYC VERIFIED REQUIRED
 * ✅ DEDUCT BALANCE ON REQUEST
 * ✅ ADD HOLD_BALANCE ON REQUEST
 * ✅ ONLY 1 PENDING WITHDRAWAL ALLOWED PER ACCOUNT
 */
export const createWithdrawal = async ({ userId, ipAddress, payload }) => {
  const session = await mongoose.startSession();

  try {
    const { accountId, amount, method, payout } = payload;

    if (!accountId || !mongoose.isValidObjectId(accountId)) {
      return { ok: false, statusCode: 400, message: "Invalid accountId" };
    }

    if (typeof amount !== "number" || amount < 1) {
      return { ok: false, statusCode: 400, message: "Invalid amount" };
    }

    if (!method || typeof method !== "string") {
      return { ok: false, statusCode: 400, message: "Method is required" };
    }

    const payoutCheck = validatePayout({ method, payout });
    if (!payoutCheck.ok) {
      return { ok: false, statusCode: 400, message: payoutCheck.message };
    }

    let createdWithdrawal = null;

    await session.withTransaction(async () => {
      /* =========================
         KYC CHECK
      ========================== */
      const user = await User.findById(userId)
        .select("kycStatus")
        .session(session);

      if (!user) {
        throw new Error("User not found");
      }

      if (user.kycStatus !== "VERIFIED") {
        throw new Error("KYC not verified. Please complete KYC to withdraw");
      }

      /* =========================
         ACCOUNT CHECK
      ========================== */
      const account = await Account.findOne({
        _id: accountId,
        user_id: userId,
      }).session(session);

      if (!account) {
        throw new Error("Account not found");
      }

      if (account.status !== "active") {
        throw new Error("Account is not active");
      }

      if (account.account_type !== "live") {
        throw new Error("Withdrawals are allowed only for live accounts");
      }

      if (account.first_deposit !== true) {
        throw new Error("Withdrawal allowed only after first approved deposit");
      }

      /* =========================
         PENDING WITHDRAW CHECK
      ========================== */
      const pending = await Withdrawal.findOne({
        user: userId,
        account: account._id,
        status: { $in: ["PENDING", "APPROVED", "PROCESSING"] },
      }).session(session);

      if (pending) {
        throw new Error("You already have a pending withdrawal request");
      }

      /* =========================
         OPEN TRADE CHECK (DB)
      ========================== */
      const openTrade = await Trade.exists({
        accountId: account._id,
        status: "OPEN",
      }).session(session);

      if (openTrade) {
        throw new Error(
          "Please close your all trade before processing any withdrawal"
        );
      }

      /* =========================
         BALANCE CHECK
      ========================== */
      const holdBalance =
        typeof account.hold_balance === "number"
          ? account.hold_balance
          : 0;

      if (amount > account.balance) {
        throw new Error("Insufficient balance");
      }

      /* =========================
         LOCK FUNDS
      ========================== */
      account.balance = account.balance - amount;
      account.hold_balance = holdBalance + amount;

      if (account.balance < 0) {
        throw new Error("Insufficient balance");
      }

      // equity = balance
      account.equity = account.balance;

      await account.save({ session });

      /* =========================
         CREATE WITHDRAWAL
      ========================== */
      const withdrawalDocs = await Withdrawal.create(
        [
          {
            user: userId,
            account: account._id,
            amount,
            method,
            payout: {
              upi_id: payout?.upi_id || "",
              bank_name: payout?.bank_name || "",
              account_holder_name: payout?.account_holder_name || "",
              account_number: payout?.account_number || "",
              ifsc: payout?.ifsc || "",
              crypto_network: payout?.crypto_network || "",
              crypto_address: payout?.crypto_address || "",
            },
            status: "PENDING",
            ipAddress: ipAddress || "",
          },
        ],
        { session },
      );

      createdWithdrawal = withdrawalDocs[0];

      /* =========================
         TRANSACTION LOG
      ========================== */
      await Transaction.create(
        [
          {
            user: userId,
            account: account._id,
            type: "WITHDRAWAL",
            amount,
            balanceAfter: account.balance,
            status: "PENDING",
            referenceType: "WITHDRAWAL",
            referenceId: createdWithdrawal._id,
            createdBy: userId,
            remark:
              "Withdrawal request created (balance deducted and amount locked in hold)",
          },
        ],
        { session },
      );
    });

    return {
      ok: true,
      statusCode: 201,
      message: "Withdrawal request created successfully",
      data: createdWithdrawal,
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: 400,
      message: error instanceof Error ? error.message : "Something went wrong",
    };
  } finally {
    session.endSession();
  }
};


/* -------------------- USER: LIST WITHDRAWALS -------------------- */

export const listUserWithdrawals = async ({ userId, query }) => {
  const { page, limit, skip } = parsePagination(query);

  const filter = buildFilter({ userId, query, isAdmin: false });

  const sortBy = typeof query.sortBy === "string" ? query.sortBy : "createdAt";
  const sortDir = query.sortDir === "asc" ? 1 : -1;

  const sort = {};
  sort[sortBy] = sortDir;

  const [items, total] = await Promise.all([
    Withdrawal.find(filter)
      .select("-payout.account_number")
      .populate("account", "account_number ")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Withdrawal.countDocuments(filter),
  ]);

  return {
    ok: true,
    statusCode: 200,
    data: {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  };
};

/* -------------------- ADMIN: LIST ALL WITHDRAWALS -------------------- */

export const listAdminWithdrawals = async ({ query }) => {
  const { page, limit, skip } = parsePagination(query);

  const filter = buildFilter({ userId: null, query, isAdmin: true });

  const sortBy = typeof query.sortBy === "string" ? query.sortBy : "createdAt";
  const sortDir = query.sortDir === "asc" ? 1 : -1;

  const sort = {};
  sort[sortBy] = sortDir;

  const [items, total] = await Promise.all([
    Withdrawal.find(filter)
      .populate("user", "name email")
      .populate("account", "account_number account_type balance hold_balance status")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Withdrawal.countDocuments(filter),
  ]);

  return {
    ok: true,
    statusCode: 200,
    data: {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  };
};

/* -------------------- ADMIN: APPROVE WITHDRAWAL -------------------- */
/**
 * ADMIN: APPROVE WITHDRAWAL
 * ✅ ONLY HOLD_BALANCE WILL DECREASE
 * ✅ BALANCE ALREADY DEDUCTED AT REQUEST TIME
 */
export const adminApproveWithdrawal = async ({ adminId, withdrawalId }) => {
  const session = await mongoose.startSession();

  try {
    if (!mongoose.isValidObjectId(withdrawalId)) {
      return { ok: false, statusCode: 400, message: "Invalid withdrawalId" };
    }

    let updatedWithdrawal = null;

    await session.withTransaction(async () => {
      const withdrawal = await Withdrawal.findById(withdrawalId).session(session);

      if (!withdrawal) {
        throw new Error("Withdrawal not found");
      }

      if (withdrawal.status !== "PENDING") {
        throw new Error("Only pending withdrawals can be approved");
      }

      const account = await Account.findOne({
        _id: withdrawal.account,
        user_id: withdrawal.user,
      }).session(session);

      if (!account) {
        throw new Error("Account not found for this withdrawal");
      }

      if (account.status !== "active") {
        throw new Error("Account is not active");
      }

      const holdBalance = typeof account.hold_balance === "number" ? account.hold_balance : 0;

      if (withdrawal.amount > holdBalance) {
        throw new Error("Hold balance mismatch. Cannot approve withdrawal");
      }

      // ✅ payout success, remove from hold
      account.hold_balance = holdBalance - withdrawal.amount;

      if (account.hold_balance < 0) {
        account.hold_balance = 0;
      }

      account.equity = account.balance;

      await account.save({ session });

      withdrawal.status = "COMPLETED";
      withdrawal.actionBy = adminId;
      withdrawal.actionAt = new Date();
      withdrawal.rejectionReason = "";

      updatedWithdrawal = await withdrawal.save({ session });

      await Transaction.findOneAndUpdate(
        {
          referenceType: "WITHDRAWAL",
          referenceId: withdrawal._id,
          user: withdrawal.user,
          account: withdrawal.account,
        },
        {
          $set: {
            status: "SUCCESS",
            balanceAfter: account.balance,
            remark: "Withdrawal approved and completed",
          },
        },
        { session },
      );
    });

    return {
      ok: true,
      statusCode: 200,
      message: "Withdrawal approved successfully",
      data: updatedWithdrawal,
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: 400,
      message: error instanceof Error ? error.message : "Something went wrong",
    };
  } finally {
    session.endSession();
  }
};

/* -------------------- ADMIN: REJECT WITHDRAWAL -------------------- */
/**
 * ADMIN: REJECT WITHDRAWAL
 * ✅ REFUND BALANCE BACK
 * ✅ REMOVE FROM HOLD_BALANCE
 */
export const adminRejectWithdrawal = async ({ adminId, withdrawalId, rejectionReason }) => {
  const session = await mongoose.startSession();

  try {
    if (!mongoose.isValidObjectId(withdrawalId)) {
      return { ok: false, statusCode: 400, message: "Invalid withdrawalId" };
    }

    const reason =
      typeof rejectionReason === "string" && rejectionReason.trim().length > 0
        ? rejectionReason.trim()
        : "Rejected by admin";

    let updatedWithdrawal = null;

    await session.withTransaction(async () => {
      const withdrawal = await Withdrawal.findById(withdrawalId).session(session);

      if (!withdrawal) {
        throw new Error("Withdrawal not found");
      }

      if (withdrawal.status !== "PENDING") {
        throw new Error("Only pending withdrawals can be rejected");
      }

      const account = await Account.findOne({
        _id: withdrawal.account,
        user_id: withdrawal.user,
      }).session(session);

      if (!account) {
        throw new Error("Account not found for this withdrawal");
      }

      if (account.status !== "active") {
        throw new Error("Account is not active");
      }

      const holdBalance = typeof account.hold_balance === "number" ? account.hold_balance : 0;

      if (withdrawal.amount > holdBalance) {
        throw new Error("Hold balance mismatch. Cannot reject withdrawal");
      }

      // ✅ refund money back + remove from hold
      account.balance = account.balance + withdrawal.amount;
      account.hold_balance = holdBalance - withdrawal.amount;

      if (account.hold_balance < 0) {
        account.hold_balance = 0;
      }

      account.equity = account.balance;

      await account.save({ session });

      withdrawal.status = "REJECTED";
      withdrawal.rejectionReason = reason;
      withdrawal.actionBy = adminId;
      withdrawal.actionAt = new Date();

      updatedWithdrawal = await withdrawal.save({ session });

      await Transaction.findOneAndUpdate(
        {
          referenceType: "WITHDRAWAL",
          referenceId: withdrawal._id,
          user: withdrawal.user,
          account: withdrawal.account,
        },
        {
          $set: {
            status: "FAILED",
            balanceAfter: account.balance,
            remark: `Withdrawal rejected: ${reason}`,
          },
        },
        { session },
      );
    });

    return {
      ok: true,
      statusCode: 200,
      message: "Withdrawal rejected successfully",
      data: updatedWithdrawal,
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: 400,
      message: error instanceof Error ? error.message : "Something went wrong",
    };
  } finally {
    session.endSession();
  }
};
