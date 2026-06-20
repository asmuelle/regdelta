import { signIn } from '../actions';

/** Reviewer sign-in (allowlist + access code). Shown when auth is configured and
 *  no valid session exists; decisions cannot be recorded until a reviewer signs in. */
export function SignIn() {
  return (
    <section className="section" aria-labelledby="signin-label">
      <h2 className="section-label" id="signin-label">
        <span>Reviewer sign-in</span>
        <span className="mono">required to record decisions</span>
      </h2>
      <form action={signIn} className="signin-form">
        <label className="signin-field">
          <span>Reviewer email</span>
          <input type="email" name="email" autoComplete="username" required />
        </label>
        <label className="signin-field">
          <span>Access code</span>
          <input type="password" name="code" autoComplete="current-password" required />
        </label>
        <button type="submit" className="action-link">
          Sign in
        </button>
      </form>
      <p className="queue-empty">
        Decisions are attributed to the signed-in reviewer and recorded as immutable, hash-chained
        events — no decision is logged without an attributable human (Invariant 6).
      </p>
    </section>
  );
}
