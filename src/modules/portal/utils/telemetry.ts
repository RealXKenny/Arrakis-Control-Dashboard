export function getCurrencyValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }

    // Handle currency response objects containing rows
    if (typeof value === 'object' && !Array.isArray(value)) {
      if (Array.isArray(value.rows)) {
        for (const row of value.rows) {
          const label = String(row?.label ?? '').toLowerCase();

          if (
            label.includes('solari') ||
            label.includes('credit')
          ) {
            const balance = Number(row?.balance);

            if (Number.isFinite(balance)) {
              return balance;
            }
          }
        }
      }

      const nested = getNumber(
        value.total,
        value.amount,
        value.balance,
        value.current,
        value.value,
        value.credits,
        value.credit,
        value.solarisCredit,
        value.solaris_credit
      );

      if (nested !== null) {
        return nested;
      }

      continue;
    }

    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return 0;
}