-- An OAuth sign-in may create an account before its username is chosen.
ALTER TABLE "identity_users" ALTER COLUMN "username" DROP NOT NULL;
