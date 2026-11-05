import { ClerkProvider, SignIn, useAuth } from '@clerk/nextjs';
import { useEffect } from 'react';

/** Signed-in Clerk users go straight to the bridge, which re-checks Discord guild membership and role. */
function ContinueWhenSignedIn() {
  const { isLoaded, isSignedIn } = useAuth();
  useEffect(() => {
    if (isLoaded && isSignedIn) window.location.replace(new URL('/auth/complete', window.location.origin).href);
  }, [isLoaded, isSignedIn]);
  return null;
}

export default function ClerkSignInPage({ publishableKey }: { publishableKey: string }) {
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={{
        variables: {
          colorPrimary: '#6366f1',
          colorBackground: '#18181b',
          colorForeground: '#e4e4e7',
          colorInput: '#27272a',
          colorInputForeground: '#e4e4e7',
        },
      }}
    >
      <main className="workspace-frame flex min-h-screen flex-col items-center justify-center gap-6 bg-transparent py-12 font-sans text-zinc-200">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Sign in to Arrakis Control</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Use your Discord account. The dashboard then checks your community membership.
          </p>
        </div>
        <ContinueWhenSignedIn />
        <SignIn routing="hash" forceRedirectUrl="/auth/complete" signUpForceRedirectUrl="/auth/complete" />
      </main>
    </ClerkProvider>
  );
}
