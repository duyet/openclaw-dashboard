describe("Clerk login", () => {
  it("user can sign in via Clerk testing commands", () => {
    const email = Cypress.env("CLERK_TEST_EMAIL") || "jane+clerk_test@example.com";

    // Prereq per Clerk docs: visit a non-protected page that loads Clerk.
    cy.visit("/sign-in");
    cy.clerkLoaded();

    cy.clerkSignIn({ strategy: "email_code", identifier: email });

    // After login, user should be able to access protected route.
    cy.visit("/activity");
    cy.waitForAppLoaded();
    cy.contains(/live feed/i).should("be.visible");
  });
});
