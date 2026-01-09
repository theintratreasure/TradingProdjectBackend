import { createInstrumentService } from '../services/instrument.service.js';

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
