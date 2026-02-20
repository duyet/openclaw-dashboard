describe("/activity page", () => {
  it("signed-out user is redirected to sign-in", () => {
    cy.visit("/activity");
    cy.location("pathname", { timeout: 20_000 }).should("match", /\/sign-in/);
  });
});
