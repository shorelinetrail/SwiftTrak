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
        // Use server-side signup to bypass email confirmation issues
        const response = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, full_name: fullName }),
        });

        // Handle potential empty or non-JSON responses
        const text = await response.text();
        let result;
        try {
          result = text ? JSON.parse(text) : {};
        } catch {
          console.error('Failed to parse signup response:', text);
          throw new Error('Server error - please try again');
        }

        if (!response.ok) {
          throw new Error(result.error || 'Failed to create account');
        }

        // Now sign in with the created credentials
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;

        toast.success('Account created successfully!');
        router.push('/dashboard');
        router.refresh();
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
        </div>

        {/* Footer */}
        <p className="text-center text-gray-500 text-sm mt-8">
          Swift and precise tracking during crisis situations
        </p>
      </div>
    </div>
  );
}
