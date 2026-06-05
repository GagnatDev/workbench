import { test, expect, captureIdea, waitForPush } from "../src/fixtures";

/**
 * The two idea-to-project flows (ui-ux-design.md §3.3, §4):
 *  - promote: a global idea becomes a new project
 *  - file: an idea captured into a project is filed into a section
 * Both verify the result persisted via a fresh browser context.
 */
test.describe("Idea promotion & filing", () => {
  test("promotes a global idea into a new project", async ({ page, openFresh }) => {
    await page.goto("/inbox");
    await captureIdea(page, "Build a shed");

    await page.getByText("Build a shed").click(); // detail sheet
    await page.getByRole("dialog").getByRole("button", { name: "Promote to project" }).click();

    // Promote sheet: title prefilled from the idea's first line.
    const promote = page.getByRole("dialog");
    await expect(promote.getByRole("textbox")).toHaveValue("Build a shed");
    await promote.getByRole("button", { name: "Create" }).click();

    await expect(page.getByRole("heading", { name: "Build a shed" })).toBeVisible();
    await waitForPush(page);

    const fresh = await openFresh();
    await fresh.goto("/projects");
    await expect(fresh.getByRole("link", { name: "Build a shed" })).toBeVisible();
  });

  test("files an idea captured in a project into a checklist section", async ({
    page,
    openFresh,
  }) => {
    // A project to capture into.
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    const newProject = page.getByRole("dialog");
    await newProject.getByPlaceholder("Project title").fill("Kitchen reno");
    await newProject.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("heading", { name: "Kitchen reno" })).toBeVisible();
    const projectId = page.url().split("/projects/")[1]!;

    // Capture is context-aware: on a project page it lands in that project's inbox.
    await captureIdea(page, "Order cabinets");
    await waitForPush(page);

    // File it as a Task — with no checklist yet, this creates the section and files.
    await page.goto(`/projects/${projectId}/inbox`);
    await page.getByText("Order cabinets").click();
    const fileAs = page.getByRole("dialog");
    await fileAs.getByRole("button", { name: "Task" }).click();
    await expect(fileAs).toBeHidden();
    await waitForPush(page);

    // Fresh context: the filed task lives in the project's Checklist section.
    const fresh = await openFresh();
    await fresh.goto(`/projects/${projectId}`);
    await fresh.getByRole("link", { name: "Checklist" }).click();
    await expect(fresh.getByRole("button", { name: "Order cabinets" })).toBeVisible();
  });
});
