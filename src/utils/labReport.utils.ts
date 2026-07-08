export const isLateReport = (dateTo: string | Date, submittedAt: Date = new Date()): boolean => {
  const deadline = new Date(dateTo);
  deadline.setDate(deadline.getDate() + 2);  // Tuesday 11:59 PM deadline
  deadline.setHours(23, 59, 59, 999);

  return submittedAt > deadline;
};