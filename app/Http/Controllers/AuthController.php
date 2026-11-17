<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request): RedirectResponse
    {
        abort_unless(config('oidc.local_login'), 403);
        $data = $request->validate(['email' => ['required', 'email'], 'password' => ['required', 'string']]);
        $data['email'] = Str::lower($data['email']);
        $key = $data['email'].'|'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, 5)) {
            throw ValidationException::withMessages(['email' => 'Zu viele Versuche. Bitte in einer Minute erneut versuchen.']);
        }
        if (! Auth::attempt($data, $request->boolean('remember'))) {
            RateLimiter::hit($key, 60);
            throw ValidationException::withMessages(['email' => 'E-Mail oder Passwort stimmt nicht.']);
        }
        RateLimiter::clear($key);
        $request->session()->regenerate();

        return redirect()->intended('/');
    }

    public function logout(Request $request): RedirectResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('login');
    }
}
