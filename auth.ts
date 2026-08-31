import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        password: { label: "Passord", type: "password" },
      },
      authorize: async (credentials) => {
        const password = credentials?.password;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!adminPassword || !password || password !== adminPassword) {
          return null;
        }

        return { id: "admin", name: "Admin" };
      },
    }),
  ],
  pages: {
    signIn: "/qr/login",
  },
  session: {
    strategy: "jwt",
  },
  trustHost: true,
});
