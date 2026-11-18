# Shared regular-account E2E access

The private-launch defaults remain unchanged: public registration is disabled,
and non-admin accounts are denied by the application governance boundary.

For a single shared regular-account test, the development workspace can permit
only the credentials stored in `MAXBOOSTER_REGULAR_E2E_USERNAME` and
`MAXBOOSTER_REGULAR_E2E_PASSWORD`. The registration exception also requires
`NODE_ENV=development`, no Replit deployment marker, and the temporary
`MAXBOOSTER_REGULAR_E2E_REGISTRATION_ENABLED=true` flag. The email must be the
reserved, non-deliverable address derived from the username:
`<username>@maxbooster-test.invalid`.

After registration, store the returned user ID as the development-only
`MAXBOOSTER_REGULAR_E2E_ACCESS_USER_ID` and keep
`MAXBOOSTER_REGULAR_E2E_ACCESS_ENABLED=true` only if the regular test account
needs to use the development preview. Turn the registration flag off after
creating the account. Production deployments cannot use either exception.
Welcome, new-user, and login-security messages are suppressed for this
non-deliverable test identity.

The user record is still written to the application's configured primary
database, which may be shared with production. Remove the account only through
the normal owner-controlled account deletion process after testing is complete.
