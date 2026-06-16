export function generateUserId() {
  const idINT = Math.floor(100000 + Math.random() * 900000);
  const idStr = idINT.toString();   // always 6 digits, no padding needed here

  return {
    idStr,
    idINT
  };
}
