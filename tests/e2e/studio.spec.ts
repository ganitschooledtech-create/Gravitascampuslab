import { expect, test, type Page } from "@playwright/test";
import { emailLogin } from "./helpers";

async function studio(page: Page, email: string) {
  await emailLogin(page, email);
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
}

test("author: sees only their program, edits a block, sends for review, cannot publish", async ({ page }) => {
  await studio(page, "author@gravitas.test");
  await page.getByRole("navigation", { name: "Studio" }).getByRole("link", { name: "Programs" }).click();
  await expect(page.getByRole("link", { name: "AI Explorer Quest" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Python Professional" })).toHaveCount(0);
  await page.getByRole("link", { name: "AI Explorer Quest" }).click();
  await page.getByRole("link", { name: "What is AI?" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);
  await page.getByRole("button", { name: /Heading Welcome, Spark Rookie/ }).click();
  await page.getByLabel("Heading text").fill("Welcome, Spark Rookie! ⚡ (updated)");
  await page.getByRole("button", { name: "Save block" }).click();
  await expect(page.getByText("Saved ✓")).toBeVisible();
  await page.getByLabel("Note (optional)").fill("Updated the welcome heading");
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page.getByText("Sent for review ✓")).toBeVisible();
  // Direct URL to a program they don't own → not found
  await page.goto("/studio/programs");
  await page.goto("/studio/programs/00000000-0000-4000-8000-000000000010"); // Python Professional (seed id) — not assigned to this author
  await expect(page.getByText("could not be found")).toBeVisible();
});

test("reviewer: sees the review queue and publishes", async ({ page }) => {
  await studio(page, "reviewer@gravitas.test");
  await page.getByRole("navigation", { name: "Studio" }).getByRole("link", { name: "Review queue" }).click();
  await page.getByRole("link", { name: "What is AI?" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/Published version 2/)).toBeVisible();
  await expect(page.getByText("v2")).toBeVisible();
});

test("super admin: builds a program from scratch, publishes a lesson, adds a school learner who can log in", async ({ page, browser }) => {
  await studio(page, "superadmin@gravitas.test");
  await page.getByRole("navigation", { name: "Studio" }).getByRole("link", { name: "Programs" }).click();
  await page.getByLabel("Program name").fill("Data Analytics");
  await page.getByLabel("Web address (slug)").fill("data-analytics");
  await page.getByLabel("Audience").selectOption("adult");
  await page.getByRole("button", { name: "Create program" }).click();
  await expect(page.getByRole("heading", { name: "Data Analytics" })).toBeVisible();
  await page.getByPlaceholder("New module title").fill("Excel basics");
  await page.getByRole("button", { name: "+ Add module" }).click();
  await page.getByPlaceholder("New lesson title").fill("Sorting data");
  await page.getByRole("button", { name: "+ Add lesson" }).click();
  await page.getByRole("link", { name: "Sorting data" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Add a block").selectOption("mcq");
  await page.getByRole("button", { name: "+ Add block" }).click();
  await page.getByLabel("Question").fill("Which menu sorts data in Excel?");
  await page.getByRole("button", { name: "Save block" }).click();
  await expect(page.getByText("Saved ✓")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/Published version 1/)).toBeVisible();

  // Add a school learner → PIN shown once → that learner can log in
  await page.goto("/studio/schools");
  await page.getByLabel("First name").fill("Meera");
  await page.getByLabel("Last name").fill("Patil");
  await page.getByLabel("Class").fill("8");
  await page.getByRole("button", { name: "Add learner" }).click();
  const status = page.getByRole("status").filter({ hasText: "username" });
  await expect(status).toContainText("meera.p");
  const pin = (await status.locator(".font-mono").innerText()).replace(/\D/g, "");
  expect(pin).toMatch(/^\d{6}$/);
  const kid = await browser.newPage();
  await kid.goto("/school-login");
  await kid.getByLabel("School code").fill("demo01");
  await kid.getByLabel("Username").fill("meera.p");
  await kid.getByLabel("6-digit PIN").fill(pin);
  await kid.getByRole("button", { name: "Let's go!" }).click();
  await expect(kid.getByRole("heading", { name: /Hi Meera/ })).toBeVisible();
});

test("school learner cannot open the studio", async ({ page }) => {
  await page.goto("/school-login");
  await page.getByLabel("School code").fill("DEMO01");
  await page.getByLabel("Username").fill("diya.s");
  await page.getByLabel("6-digit PIN").fill("615204");
  await page.getByRole("button", { name: "Let's go!" }).click();
  await expect(page).toHaveURL(/\/learn$/);
  await page.goto("/studio");
  await expect(page).toHaveURL(/\/learn$/);
});
