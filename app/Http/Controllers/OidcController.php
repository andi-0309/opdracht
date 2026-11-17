<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\OidcClient;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

class OidcController extends Controller
{
    public function redirect(Request $request, OidcClient $client): RedirectResponse
    {
        abort_unless(config('oidc.enabled'), 404);
        $request->session()->forget('oidc_flow');
        try {
            $metadata = $client->discovery();
            $flow = ['state' => Str::random(64), 'nonce' => Str::random(64), 'verifier' => Str::random(96), 'created_at' => time()];
            $request->session()->put('oidc_flow', $flow);

            return redirect()->away($client->authorizationUrl($metadata, $flow))->withHeaders(['Cache-Control' => 'no-store']);
        } catch (Throwable $exception) {
            return $this->failed($exception);
        }
    }

    public function callback(Request $request, OidcClient $client): RedirectResponse
    {
        abort_unless(config('oidc.enabled'), 404);
        $flow = $request->session()->pull('oidc_flow');
        if (! is_array($flow) || ! is_string($request->query('state'))
            || ! hash_equals($flow['state'], $request->query('state'))
            || time() - $flow['created_at'] > 600) {
            return redirect()->route('login')->withErrors(['oidc' => 'Die Anmeldung ist abgelaufen. Bitte erneut anmelden.']);
        }
        if ($request->has('error') || ! is_string($request->query('code')) || $request->query('code') === '') {
            return redirect()->route('login')->withErrors(['oidc' => 'Die Anmeldung wurde nicht freigegeben.']);
        }
        try {
            $claims = $client->claims($request->query('code'), $flow);
            $user = DB::transaction(function () use ($claims): User {
                $user = User::where('oidc_issuer', $claims['iss'])->where('oidc_subject', $claims['sub'])->first();
                if ($user) {
                    return $user;
                }
                $email = is_string($claims['email'] ?? null) ? Str::lower($claims['email']) : '';
                if (strlen($email) > 255 || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    throw ValidationException::withMessages(['oidc' => 'Authentik hat keine gültige E-Mail-Adresse übermittelt. Bitte die Profilfreigabe prüfen.']);
                }
                if (User::where('email', $email)->exists()) {
                    throw ValidationException::withMessages(['oidc' => 'Für diese E-Mail-Adresse besteht bereits ein anderes Konto. Bitte die Administration kontaktieren.']);
                }
                $user = new User([
                    'name' => Str::limit(is_string($claims['name'] ?? null) && trim($claims['name']) !== '' ? $claims['name'] : $email, 100, ''),
                    'email' => $email,
                    'password' => Str::random(64),
                ]);
                $user->oidc_issuer = $claims['iss'];
                $user->oidc_subject = $claims['sub'];
                $user->save();

                return $user;
            });
            Auth::login($user);
            $request->session()->regenerate();

            return redirect()->intended('/')->withHeaders(['Cache-Control' => 'no-store']);
        } catch (ValidationException $exception) {
            return redirect()->route('login')->withErrors($exception->errors());
        } catch (Throwable $exception) {
            return $this->failed($exception);
        }
    }

    private function failed(Throwable $exception): RedirectResponse
    {
        // Exception messages from HTTP/JWT libraries may contain credentials or tokens.
        Log::warning('OIDC sign-in failed.', ['exception_type' => $exception::class]);

        return redirect()->route('login')->withErrors(['oidc' => 'Anmeldung über Authentik nicht möglich. Bitte erneut versuchen oder die Administration kontaktieren.']);
    }
}
