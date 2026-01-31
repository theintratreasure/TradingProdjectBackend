import Symbol from '../models/Symbol.model.js';

export async function getSymbolsService({
  page = 1,
  limit = 50,
  category,
  isActive,
  search,
  sortBy = 'createdAt',
  sortOrder = 'desc'
}) {
  try {
    // Build filter object
    const filter = {};
    if (category) filter.category = { $regex: category, $options: 'i' };
    if (isActive !== undefined) filter.isActive = isActive;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute queries in parallel for better performance
    const [symbols, totalCount, totalSymbols, activeSymbols, inactiveSymbols, categoryAggResult] = await Promise.all([
      Symbol.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Symbol.countDocuments(filter),
      Symbol.countDocuments({}),
      Symbol.countDocuments({ isActive: true }),
      Symbol.countDocuments({ isActive: false }),
      Symbol.aggregate([
        {
          $group: {
            _id: '$category',
            active: { $sum: { $cond: ['$isActive', 1, 0] } },
            inactive: { $sum: { $cond: ['$isActive', 0, 1] } },
            total: { $sum: 1 }
          }
        }
      ])
    ]);

    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Format category statistics
    const categoryBreakdown = {};
    categoryAggResult.forEach(cat => {
      categoryBreakdown[cat._id] = {
        active: cat.active,
        inactive: cat.inactive,
        total: cat.total
      };
    });

    return {
      summary: {
        totalSymbols,
        activeSymbols,
        inactiveSymbols,
        categoryBreakdown
      },
      symbols,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? page + 1 : null,
        prevPage: hasPrevPage ? page - 1 : null
      }
    };
  } catch (err) {
    throw err;
  }
}

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
