import mongoose from 'mongoose';

const MarketScheduleSchema = new mongoose.Schema(
  {
    segment: { type: String, required: true, unique: true, index: true }, // forex/crypto/metal etc

    timezone: { type: String, default: 'Asia/Kolkata' },

    openTime: { type: String, required: true, default: '09:15' }, // HH:mm
    closeTime: { type: String, required: true, default: '15:30' }, // HH:mm

    // weekly off days (market closed full day)
    weeklyOff: {
      type: [String],
      default: ['SUNDAY'],
      enum: [
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
        'SATURDAY',
        'SUNDAY',
      ],
    },

    // full day closed by date YYYY-MM-DD
    holidays: { type: [String], default: [] },

    // day wise time override (example: SATURDAY close 14:30)
    // { "SATURDAY": { "openTime": "09:15", "closeTime": "14:30" } }
    dayOverrides: { type: Object, default: {} },

    // date wise time override (example: "2026-02-03" close 16:00)
    // { "2026-02-03": { "openTime": "09:15", "closeTime": "16:00" } }
    dateOverrides: { type: Object, default: {} },

    isEnabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const MarketSchedule = mongoose.model('MarketSchedule', MarketScheduleSchema);
