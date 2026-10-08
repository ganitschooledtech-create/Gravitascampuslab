import { expect, test } from "@playwright/test";
import { schoolLogin } from "./helpers";

test("school learner logs in with PIN and works through a lesson step by step", async ({ page }) => {
  await schoolLogin(page, "aarav.k", "482913");
  await expect(page.getByRole("heading", { name: /Hi Aarav/ })).toBeVisible();
  await page.getByRole("link", { name: "Level map" }).click();
  await expect(page.getByRole("heading", { name: /Level 1: Spark Rookie/ })).toBeVisible();
  await expect(page.getByText("Pass the previous level").first()).toBeVisible(); // Level 2 locked
  await page.getByText("Start →").first().click(); // the Start button opens the first lesson
  await page.waitForLoadState("networkidle"); // wait until the player is interactive

  // Step 1–7 are display blocks → Next
  for (let i = 1; i <= 7; i++) {
    await page.getByRole("button", { name: "Next →" }).click();
    await expect(page.getByText(`Step ${i + 1} of 14`)).toBeVisible();
  }
  // Step 8: MCQ — answer wrong first, see feedback, retry right
  await page.getByLabel("A light switch").check();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByText(/no learning involved/)).toBeVisible();
  await page.getByRole("button", { name: "Next →" }).click();
  await expect(page.getByText("Select ALL the things AI can do.")).toBeVisible();
  await page.screenshot({ path: "test-results/lesson-player.png", fullPage: true });
});

test("wrong PIN shows a friendly error and never says which part was wrong", async ({ page }) => {
  await page.goto("/school-login");
  await page.getByLabel("School code").fill("DEMO01");
  await page.getByLabel("Username").fill("diya.s");
  await page.getByLabel("6-digit PIN").fill("111111");
  await page.getByRole("button", { name: "Let's go!" }).click();
  await expect(page.locator("form [role=alert]")).toHaveText("School code, username or PIN is incorrect.");
});

test("protected pages redirect to login when signed out", async ({ page }) => {
  await page.goto("/studio");
  await expect(page).toHaveURL(/\/login\?next=%2Fstudio/);
});
