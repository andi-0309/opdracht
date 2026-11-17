<?php

namespace App\Services;

use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class OidcClient
{
    /** @return array<string, mixed> */
    public function discovery(): array
    {
        $issuer = config('oidc.issuer');
        $this->assertProviderUrl($issuer);
        if (! config('oidc.client_id') || ! config('oidc.client_secret')) {
            throw new RuntimeException('OIDC client configuration missing.');
        }
        $metadata = Http::acceptJson()->timeout(10)->withoutRedirecting()
            ->get(rtrim($issuer, '/').'/.well-known/openid-configuration')->throw()->json();
        if (! is_array($metadata) || ($metadata['issuer'] ?? null) !== $issuer) {
            throw new RuntimeException('OIDC discovery issuer mismatch.');
        }
        foreach (['authorization_endpoint', 'token_endpoint', 'jwks_uri'] as $key) {
            $this->assertProviderUrl($metadata[$key] ?? '');
        }

        return $metadata;
    }

    /** @param array<string, mixed> $metadata
     * @param  array{state: string, nonce: string, verifier: string, created_at: int}  $flow
     */
    public function authorizationUrl(array $metadata, array $flow): string
    {
        return $metadata['authorization_endpoint'].'?'.http_build_query([
            'client_id' => config('oidc.client_id'),
            'redirect_uri' => config('oidc.redirect_uri'),
            'response_type' => 'code',
            'scope' => 'openid profile email',
            'state' => $flow['state'],
            'nonce' => $flow['nonce'],
            'code_challenge' => JWT::urlsafeB64Encode(hash('sha256', $flow['verifier'], true)),
            'code_challenge_method' => 'S256',
        ], '', '&', PHP_QUERY_RFC3986);
    }

    /** @param array{state: string, nonce: string, verifier: string, created_at: int} $flow
     * @return array<string, mixed>
     */
    public function claims(string $code, array $flow): array
    {
        $metadata = $this->discovery();
        $tokens = Http::asForm()->acceptJson()->timeout(10)->withoutRedirecting()
            ->withBasicAuth(urlencode(config('oidc.client_id')), urlencode(config('oidc.client_secret')))
            ->post($metadata['token_endpoint'], [
                'grant_type' => 'authorization_code',
                'code' => $code,
                'redirect_uri' => config('oidc.redirect_uri'),
                'code_verifier' => $flow['verifier'],
            ])->throw()->json();
        if (! is_array($tokens) || ! is_string($tokens['id_token'] ?? null)) {
            throw new RuntimeException('OIDC ID token missing.');
        }
        $jwks = Http::acceptJson()->timeout(10)->withoutRedirecting()->get($metadata['jwks_uri'])->throw()->json();
        $keys = array_values(array_filter($jwks['keys'] ?? [], fn ($key) => is_array($key)
            && ($key['kty'] ?? null) === 'RSA'
            && ($key['alg'] ?? 'RS256') === 'RS256'
            && ($key['use'] ?? 'sig') === 'sig'));
        $claims = (array) JWT::decode($tokens['id_token'], JWK::parseKeySet(['keys' => $keys], 'RS256'));
        $audience = $claims['aud'] ?? null;
        $audiences = is_array($audience) ? $audience : [$audience];
        if (($claims['iss'] ?? null) !== config('oidc.issuer')
            || ! in_array(config('oidc.client_id'), $audiences, true)
            || (count($audiences) > 1 && ! isset($claims['azp']))
            || (isset($claims['azp']) && $claims['azp'] !== config('oidc.client_id'))
            || ! is_int($claims['exp'] ?? null) || $claims['exp'] <= time()
            || ! is_int($claims['iat'] ?? null) || $claims['iat'] > time()
            || ! is_string($claims['sub'] ?? null) || $claims['sub'] === '' || strlen($claims['sub']) > 255
            || ! is_string($claims['nonce'] ?? null) || ! hash_equals($flow['nonce'], $claims['nonce'])) {
            throw new RuntimeException('OIDC ID token claims rejected.');
        }

        return $claims;
    }

    private function assertProviderUrl(string $url): void
    {
        $parts = parse_url($url);
        $issuer = parse_url(config('oidc.issuer'));
        if (! is_array($parts) || ! is_array($issuer)
            || ($parts['scheme'] ?? '') !== 'https'
            || empty($parts['host']) || ($parts['host'] ?? null) !== ($issuer['host'] ?? null)
            || ($parts['port'] ?? 443) !== ($issuer['port'] ?? 443)
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['fragment']) || isset($parts['query'])) {
            throw new RuntimeException('OIDC requires HTTPS endpoints on the configured issuer origin.');
        }
    }
}
