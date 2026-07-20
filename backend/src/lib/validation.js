function badRequest(message = 'بيانات غير صالحة') {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function requiredString(value, label, { min = 1, max = 5000 } = {}) {
  if (typeof value !== 'string') throw badRequest(`${label} مطلوب`);
  const result = value.trim();
  if (result.length < min || result.length > max) throw badRequest(`${label} غير صالح`);
  return result;
}

function optionalString(value, label, { max = 5000 } = {}) {
  if (value === undefined || value === null || value === '') return null;
  return requiredString(value, label, { min: 0, max });
}

function integer(value, label, { min, max } = {}) {
  const result = Number(value);
  if (!Number.isInteger(result) || (min !== undefined && result < min) || (max !== undefined && result > max)) throw badRequest(`${label} غير صالح`);
  return result;
}

function isoDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw badRequest(`${label} غير صالح`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw badRequest(`${label} غير صالح`);
  return date;
}

function enumValue(value, allowed, label) {
  if (!allowed.includes(value)) throw badRequest(`${label} غير صالح`);
  return value;
}

function stringArray(value, label, { maxItems = 30, itemMax = 300 } = {}) {
  if (!Array.isArray(value) || value.length > maxItems) throw badRequest(`${label} غير صالح`);
  return value.map((item) => requiredString(item, label, { max: itemMax }));
}

module.exports = { badRequest, requiredString, optionalString, integer, isoDate, enumValue, stringArray };
