export function validationMessages(error: { issues: Array<{ message: string }> }): string[] {
  return error.issues.map((issue) => issue.message);
}
