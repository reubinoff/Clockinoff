// One string for every register failure past field validation (#159).
// It nudges Sign in and names neither Google nor a password, and it does
// not say the address is taken — a duplicate email and any other
// unexpected sign-up failure stay indistinguishable.
export const REGISTER_FAILURE_COPY =
  "Couldn't complete sign-up. Sign in, or try again.";
