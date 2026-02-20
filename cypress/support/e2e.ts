// Cypress support file.
// Place global hooks/commands here.

/// <reference types="cypress" />

import { addClerkCommands } from "@clerk/testing/cypress";

addClerkCommands({ Cypress, cy });

import "./commands";
