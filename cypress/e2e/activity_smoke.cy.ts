describe("/activity page", () => {
  if (Cypress.env("AUTH_MODE") === "local") {
    it("loads the activity page in local auth mode", () => {
      cy.visit("/activity");
      cy.location("pathname").should("eq", "/activity");
    });
  } else {
    it("signed-out user is redirected to sign-in", () => {
      cy.visit("/activity");
      cy.location("pathname", { timeout: 20_000 }).should("match", /\/sign-in/);
    });
  }
});
