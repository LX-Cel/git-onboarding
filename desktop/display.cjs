const SCALES = [1, 1.25, 1.5, 2];
function validScale(value) {
  if (!SCALES.includes(value)) throw new Error("不支持的显示比例");
  return value;
}
module.exports = { SCALES, validScale };
