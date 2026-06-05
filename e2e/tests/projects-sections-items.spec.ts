import { test, expect, waitForPush } from "../src/fixtures";

/**
 * Core CRUD across the sync boundary: create a project, add a checklist section,
 * add and complete a task — then verify the whole tree round-tripped through the
 * server by reading it back in a fresh browser context.
 */
test("create a project, add a checklist section, add and complete a task", async ({
  page,
  openFresh,
}) => {
  await page.goto("/projects");

  // Create the project.
  await page.getByRole("button", { name: "New project" }).click();
  const newProject = page.getByRole("dialog");
  await newProject.getByPlaceholder("Project title").fill("Garden bench");
  await newProject.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: "Garden bench" })).toBeVisible();
  await waitForPush(page);

  // Add a checklist section (defaults its name to "Checklist").
  await page.getByRole("button", { name: "Add section" }).click();
  const addSection = page.getByRole("dialog");
  await addSection.getByRole("button", { name: "Checklist" }).click();
  await addSection.getByRole("button", { name: "Create section" }).click();
  await expect(page.getByRole("heading", { name: "Checklist" })).toBeVisible();

  // Add a task and complete it.
  await page.getByPlaceholder("Add a task…").fill("Buy screws");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByRole("button", { name: "Buy screws" })).toBeVisible();
  await page.getByRole("button", { name: "Mark done" }).click();
  await expect(page.getByRole("button", { name: "Mark not done" })).toBeVisible();
  await waitForPush(page);

  // Fresh context: the project, section, and completed task must come from the server.
  const fresh = await openFresh();
  await fresh.goto("/projects");
  await fresh.getByRole("link", { name: "Garden bench" }).click();
  await expect(fresh.getByRole("heading", { name: "Garden bench" })).toBeVisible();
  await fresh.getByRole("link", { name: "Checklist" }).click();
  await expect(fresh.getByRole("button", { name: "Buy screws" })).toBeVisible();
  await expect(fresh.getByRole("button", { name: "Mark not done" })).toBeVisible();
});
