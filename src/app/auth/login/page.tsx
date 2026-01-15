'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [signUpSuccess, setSignUpSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    // Validate inputs
    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please enter email and password');
      return;
    }

    if (isSignUp && !fullName.trim()) {
      setErrorMessage('Please enter your full name');
      return;
    }

    if (isSignUp && password.length < 6) {
      setErrorMessage('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();

      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        });

        if (error) throw error;

        // Check if email confirmation is required
        if (data.user && !data.session) {
          setSignUpSuccess(true);
        } else if (data.session) {
          toast.success('Account created successfully!');
          router.push('/dashboard');
          router.refresh();
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        router.push('/dashboard');
        router.refresh();
      }
    } catch (error: unknown) {
      console.error('[Auth] Error:', error);
      const message = error instanceof Error ? error.message : 'An error occurred';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-600 rounded-xl mb-4">
            <span className="text-white font-bold text-3xl">S</span>
          </div>
          <h1 className="text-2xl font-bold text-white">SwiftTrak</h1>
          <p className="text-gray-400 mt-2">Crisis Management System</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-xl p-8">
          {signUpSuccess ? (
            /* Success State - Email Confirmation Required */
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Check your email</h2>
              <p className="text-gray-600 mb-4">
                We&apos;ve sent a confirmation link to <strong>{email}</strong>
              </p>
              <p className="text-sm text-gray-500 mb-6">
                Click the link in the email to verify your account and complete sign up.
              </p>
              <button
                onClick={() => {
                  setSignUpSuccess(false);
                  setIsSignUp(false);
                }}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Return to sign in
              </button>
            </div>
          ) : (
            /* Sign In / Sign Up Form */
            <>
              <h2 className="text-xl font-semibold text-gray-900 mb-6">
                {isSignUp ? 'Create an account' : 'Sign in to your account'}
              </h2>

              {errorMessage && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{errorMessage}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {isSignUp && (
                  <Input
                    label="Full Name"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Doe"
                    required
                  />
                )}

                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />

                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  hint={isSignUp ? 'At least 6 characters' : undefined}
                />

                <Button type="submit" className="w-full" loading={isLoading}>
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <button
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setErrorMessage('');
                  }}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  {isSignUp
                    ? 'Already have an account? Sign in'
                    : "Don't have an account? Sign up"}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-gray-500 text-sm mt-8">
          Swift and precise tracking during crisis situations
        </p>
      </div>
    </div>
  );
}
