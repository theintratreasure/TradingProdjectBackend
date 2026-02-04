import { createInstrumentService, deleteInstrumentService, getAllInstrumentService, searchInstrumentService, updateInstrumentService } from '../services/instrument.service.js';

export const createInstrument = async (req, res) => {
  try {
    const instrument = await createInstrumentService(req.body);

    return res.status(201).json({
      success: true,
      message: 'Instrument created successfully',
      data: instrument
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

export async function getInstrument(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 10, 1);
    const segment = req.query.segment || 'ALL';

    const { data, total } = await getAllInstrumentService(
      page,
      limit,
      segment
    );

    res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

export async function searchInstrument(req, res) {
  try {
    const q = req.query.q;
    const segment = req.query.segment || "ALL";
    const limit = req.query.limit || 20;

    const data = await searchInstrumentService(q, segment, limit);

    return res.json({
      success: true,
      data
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

export const updateInstrument = async (req, res) => {
  try {
    const { id } = req.params;

    const instrument = await updateInstrumentService(id, req.body);

    return res.json({
      success: true,
      message: 'Instrument updated successfully',
      data: instrument
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

export const deleteInstrument = async (req, res) => {
  try {
    const { id } = req.params;

    const instrument = await deleteInstrumentService(id);

    return res.json({
      success: true,
      message: 'Instrument deleted successfully',
      data: instrument
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};
