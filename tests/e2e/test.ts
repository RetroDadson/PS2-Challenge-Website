import { expect, test as base, type Page, type Response } from "@playwright/test";

export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    const failures = watchForUnexpectedBrowserErrors(page);

    await use(page);
    expectNoUnexpectedBrowserErrors(failures);
  }
});

export { expect };

export function watchForUnexpectedBrowserErrors(page: Page) {
  const failures: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      failures.push(`Console error: ${message.text()}`);
    }
  });

  page.on("pageerror", (error) => {
    failures.push(`Page error: ${error.message}`);
  });

  page.on("response", (response) => {
    if (isUnexpectedFailure(response)) {
      failures.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });

  return failures;
}

export function expectNoUnexpectedBrowserErrors(failures: string[]) {
  expect(failures, "Unexpected browser console, page, or network errors").toEqual([]);
}

function isUnexpectedFailure(response: Response) {
  if (response.status() < 400) {
    return false;
  }
  const url = response.url();
  return !url.endsWith("/favicon.ico");
}
