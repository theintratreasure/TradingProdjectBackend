import Symbol from '../models/Symbol.model.js';

export async function bulkInsertSymbolsService(symbols) {
  const formatted = symbols.map(item => ({
    name: item.name,
    code: item.code,
    category: item.category
  }));

  try {
    const result = await Symbol.insertMany(formatted, {
      ordered: false
    });

    return {
      inserted: result.length
    };
  } catch (err) {
    if (err.code === 11000) {
      return {
        inserted: 0,
        skippedDuplicates: true
      };
    }

    throw err;
  }
}
