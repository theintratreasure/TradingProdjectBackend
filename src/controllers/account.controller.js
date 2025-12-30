import {
  createAccount,
  getUserAccounts,
  getUserAccountDetail,
  resetDemoAccount
} from "../services/account.service.js";

export async function createAccountController(req, res) {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const {
      account_plan_id,
      account_type,
      leverage,
      currency
    } = req.body;

    if (!account_plan_id || !account_type ) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    const data = await createAccount({
      userId: req.user._id,
      account_plan_id,
      account_type,
    });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data
    });
  } catch (err) {
    return res.status(err.statusCode || 400).json({
      success: false,
      message: err.message
    });
  }
}

export async function getMyAccounts(req, res) {
  try {
    const data = await getUserAccounts(req.user._id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getMyAccountDetail(req, res) {
  try {
    const data = await getUserAccountDetail({
      userId: req.user._id,
      accountId: req.params.id
    });

    res.json({ success: true, data });
  } catch (err) {
    res
      .status(err.statusCode || 500)
      .json({ success: false, message: err.message });
  }
}

export async function resetDemoAccountController(req, res) {
  try {
    const data = await resetDemoAccount({
      userId: req.user._id,
      accountId: req.params.id
    });

    res.json({
      success: true,
      message: "Demo balance reset",
      data
    });
  } catch (err) {
    res
      .status(err.statusCode || 500)
      .json({ success: false, message: err.message });
  }
}
