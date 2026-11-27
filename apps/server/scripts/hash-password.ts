// Prints the value of ADMIN_PASSWORD_HASH for a password read from the standard input, so that the
// password itself never lands in the shell history:
//   npm run hash-password --workspace apps/server

import { createInterface } from "node:readline/promises";
import { hashPassword } from "../src/auth/password";

const readline = createInterface({ input: process.stdin, output: process.stderr });
const password = await readline.question("Mot de passe de l’admin : ");
readline.close();
if (password.length < 8) {
  console.error("Le mot de passe doit faire au moins 8 caractères.");
  process.exit(1);
}
console.log(hashPassword(password));
