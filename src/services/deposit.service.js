/* CREATE DEPOSIT */
import Deposit from '../models/Deposit.model.js';
import Account from '../models/Account.model.js';
import AccountPlan from '../models/AccountPlan.model.js';
import DepositModel from '../models/Deposit.model.js';

export async function createDepositService({
  userId,
  account,
  amount,
  method,
  proof,
  ipAddress
}) {
  /* ---------------- BASIC VALIDATION ---------------- */

  if (!account || !amount || !method || !proof) {
    throw new Error('All fields are required');
  }

  // amount must be a valid pure number
  if (typeof amount !== 'number' || Number.isNaN(amount)) {
    throw new Error('Invalid deposit amount');
  }

  // system-wide minimum deposit
  if (amount < 50) {
    throw new Error('Minimum deposit amount is $50');
  }

  /* ---------------- ACCOUNT VALIDATION ---------------- */

  const userAccount = await Account.findOne({
    _id: account,
    user_id: userId,
    status: 'active'
  }).lean();

  if (!userAccount) {
    throw new Error('Account not found or inactive');
  }

  /* ---------------- FIRST DEPOSIT LOGIC ---------------- */

  // If first_deposit flag is FALSE → this is first deposit
  if (userAccount.first_deposit === false) {
    const plan = await AccountPlan.findById(
      userAccount.account_plan_id
    ).lean();

    if (!plan) {
      throw new Error('Account plan not found');
    }

    if (amount < plan.minDeposit) {
      throw new Error(
        `Minimum first deposit for this account is $${plan.minDeposit}`
      );
    }
  }

  /* ---------------- CREATE DEPOSIT ---------------- */

  const deposit = await Deposit.create({
    user: userId,
    account,
    amount,
    method,
    proof,
    ipAddress
  });

  return deposit;
}

/* USER DEPOSITS */
export async function getUserDepositsService(userId) {
  return DepositModel.find({ user: userId })
    .sort({ createdAt: -1 })
    .populate('account', 'accountNo environment');
}

/* USER STATUS CHECK */
export async function getDepositStatusService(userId, depositId) {
  const deposit = await Deposit.findOne({
    _id: depositId,
    user: userId
  });

  if (!deposit) throw new Error('Deposit not found');
  return deposit;
}

/* ADMIN GET ALL */
export async function adminGetAllDepositsService() {
  return Deposit.find()
    .sort({ createdAt: -1 })
    .populate('user', 'email')
    .populate('account', 'accountNo environment');
}

/* ADMIN APPROVE */
export async function approveDepositService(depositId, adminId) {
  const deposit = await Deposit.findById(depositId);
  if (!deposit) throw new Error('Deposit not found');

  if (deposit.status !== 'PENDING') {
    throw new Error('Deposit already processed');
  }

  deposit.status = 'APPROVED';
  deposit.actionBy = adminId;
  deposit.actionAt = new Date();
  deposit.rejectionReason = '';

  await deposit.save();

  /* IMPORTANT:
     Balance update should be atomic & separate
     Example:
     await Account.findByIdAndUpdate(deposit.account, {
       $inc: { balance: deposit.amount }
     });
  */

  return deposit;
}

/* ADMIN REJECT */
export async function rejectDepositService(depositId, adminId, reason) {
  if (!reason) throw new Error('Rejection reason required');

  const deposit = await Deposit.findById(depositId);
  if (!deposit) throw new Error('Deposit not found');

  if (deposit.status !== 'PENDING') {
    throw new Error('Deposit already processed');
  }

  deposit.status = 'REJECTED';
  deposit.rejectionReason = reason;
  deposit.actionBy = adminId;
  deposit.actionAt = new Date();

  await deposit.save();
  return deposit;
}
