import { customAlphabet } from "nanoid";

// Uten 0, O, 1, l, I — unngår forveksling på trykte koder
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export const generateSlug = customAlphabet(alphabet, 8);
