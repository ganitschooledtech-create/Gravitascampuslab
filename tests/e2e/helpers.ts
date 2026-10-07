import { expect, type Page } from "@playwright/test";

export async function schoolLogin(page: Page, username: string, pin: string, school = "DEMO01") {
  await page.goto("/school-login");
  await page.getByLabel("School code").fill(school);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("6-digit PIN").fill(pin);
  await page.getByRole("button", { name: "Let's go!" }).click();
  await expect(page).toHaveURL(/\/learn$/);
}

export async function emailLogin(page: Page, email: string, password = "Gravitas@2026") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/learn/);
}
