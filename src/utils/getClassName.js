export default function getClassName(parseClass) {
  if (parseClass && parseClass.className) {
    return parseClass.className;
  }
  return parseClass;
}