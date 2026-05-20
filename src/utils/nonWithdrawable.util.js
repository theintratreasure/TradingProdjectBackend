export function getNonWithdrawableBalance(accountLike) {
  const value = Number(accountLike?.non_withdrawable_balance || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function getWithdrawableBalance(accountLike) {
  const balance = Number(accountLike?.balance || 0);
  const locked = getNonWithdrawableBalance(accountLike);
  return Math.max(0, Number((balance - locked).toFixed(8)));
}

export function clampNonWithdrawableToBalance({
  balance,
  nonWithdrawableBalance,
}) {
  const safeBalance = Number(balance || 0);
  const safeLocked = Number(nonWithdrawableBalance || 0);

  if (!Number.isFinite(safeBalance) || safeBalance <= 0) return 0;
  if (!Number.isFinite(safeLocked) || safeLocked <= 0) return 0;

  return Number(Math.min(safeBalance, safeLocked).toFixed(8));
}

export function increaseNonWithdrawableBalance({
  currentLocked,
  amount,
  balanceAfter,
}) {
  const nextLocked =
    getNonWithdrawableBalance({ non_withdrawable_balance: currentLocked }) +
    Number(amount || 0);

  return clampNonWithdrawableToBalance({
    balance: balanceAfter,
    nonWithdrawableBalance: nextLocked,
  });
}

export function consumeNonWithdrawableBalance({
  currentLocked,
  amount,
  balanceAfter,
}) {
  const safeLocked = getNonWithdrawableBalance({
    non_withdrawable_balance: currentLocked,
  });
  const safeAmount = Number(amount || 0);

  const nextLocked =
    safeAmount > 0 ? Math.max(0, safeLocked - safeAmount) : safeLocked;

  return clampNonWithdrawableToBalance({
    balance: balanceAfter,
    nonWithdrawableBalance: nextLocked,
  });
}
