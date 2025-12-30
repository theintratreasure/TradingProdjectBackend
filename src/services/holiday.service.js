import HolidayModel from '../models/Holiday.model.js';

export async function createHolidayService(data) {
  return HolidayModel.create(data);
}

export async function getAllHolidaysService(page, limit) {
  const skip = (page - 1) * limit;

  const data = await HolidayModel.find({})
    .sort({ date: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await HolidayModel.countDocuments({});

  return { data, total };
}


export async function getHolidayByIdService(id) {
  return HolidayModel.findById(id);
}

export async function updateHolidayService(id, data) {
  return HolidayModel.findByIdAndUpdate(id, data, { new: true });
}

export async function deleteHolidayService(id) {
  return HolidayModel.findByIdAndDelete(id);
}
