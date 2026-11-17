<?php

namespace Tests\Feature;

use App\Models\Task;
use App\Models\User;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class OidcTest extends TestCase
{
    use LazilyRefreshDatabase;

    private const ISSUER = 'https://auth.example.test/application/o/opdracht/';

    protected function setUp(): void
    {
        parent::setUp();
        config(['oidc.enabled' => true, 'oidc.issuer' => self::ISSUER, 'oidc.client_id' => 'opdracht',
            'oidc.client_secret' => 'test-secret', 'oidc.redirect_uri' => 'https://opdracht.example.test/auth/oidc/callback']);
        Http::preventStrayRequests();
    }

    public function test_redirect_uses_code_flow_with_nonce_state_and_s256_pkce(): void
    {
        Http::fake([self::ISSUER.'.well-known/openid-configuration' => Http::response($this->metadata())]);

        $response = $this->get('/auth/oidc')->assertRedirect()->assertSessionHas('oidc_flow');
        parse_str(parse_url($response->headers->get('Location'), PHP_URL_QUERY), $query);
        $flow = session('oidc_flow');
        $this->assertSame('code', $query['response_type']);
        $this->assertSame('openid profile email', $query['scope']);
        $this->assertSame('S256', $query['code_challenge_method']);
        $this->assertSame(JWT::urlsafeB64Encode(hash('sha256', $flow['verifier'], true)), $query['code_challenge']);
        $this->assertSame($flow['state'], $query['state']);
        $this->assertSame($flow['nonce'], $query['nonce']);
        $this->assertArrayNotHasKey('client_secret', $query);
        Http::assertSentCount(1);
    }

    public function test_signed_callback_provisions_user_and_replay_is_rejected(): void
    {
        $this->fakeProvider();
        Task::factory()->create();

        $this->withSession(['oidc_flow' => $this->flow()])->get('/auth/oidc/callback?state=expected-state&code=test-code')
            ->assertRedirect('/')->assertSessionMissing('oidc_flow');

        $user = User::where('oidc_subject', 'authentik-user-1')->firstOrFail();
        $this->assertAuthenticatedAs($user);
        $this->assertSame(self::ISSUER, $user->oidc_issuer);
        $this->assertSame('person@example.test', $user->email);
        $this->getJson('/api/state')->assertJsonCount(0, 'tasks');
        Http::assertSent(fn (Request $request): bool => $request->url() === 'https://auth.example.test/application/o/token/'
            && $request['grant_type'] === 'authorization_code' && $request['code'] === 'test-code'
            && $request['code_verifier'] === $this->flow()['verifier']
            && $request['redirect_uri'] === config('oidc.redirect_uri')
            && $request->hasHeader('Authorization', 'Basic '.base64_encode('opdracht:test-secret')));
        $this->post('/logout');
        $this->get('/auth/oidc/callback?state=expected-state&code=test-code')->assertSessionHasErrors('oidc');
        $this->assertGuest();
        Http::assertSentCount(3);
    }

    public function test_existing_identity_keeps_its_account_when_email_changes(): void
    {
        $user = User::factory()->create(['oidc_issuer' => self::ISSUER, 'oidc_subject' => 'authentik-user-1']);
        $this->fakeProvider(['email' => 'changed@example.test']);

        $this->withSession(['oidc_flow' => $this->flow()])->get('/auth/oidc/callback?state=expected-state&code=test-code')->assertRedirect('/');

        $this->assertAuthenticatedAs($user);
        $this->assertDatabaseCount('users', 1);
    }

    public function test_matching_email_does_not_link_or_take_over_local_account(): void
    {
        $local = User::factory()->create(['email' => 'person@example.test']);
        $this->fakeProvider();

        $this->withSession(['oidc_flow' => $this->flow()])->get('/auth/oidc/callback?state=expected-state&code=test-code')
            ->assertRedirect('/login')->assertSessionHasErrors(['oidc' => 'Für diese E-Mail-Adresse besteht bereits ein anderes Konto. Bitte die Administration kontaktieren.']);

        $this->assertGuest();
        $this->assertDatabaseCount('users', 1);
        $this->assertNull($local->fresh()->oidc_subject);
    }

    public static function invalidFlows(): array
    {
        return ['no flow' => [null, 'expected-state'], 'wrong state' => [0, 'wrong-state'], 'expired' => [601, 'expected-state']];
    }

    #[DataProvider('invalidFlows')]
    public function test_invalid_state_or_expired_flow_never_exchanges_code(?int $age, string $state): void
    {
        if ($age !== null) {
            $this->withSession(['oidc_flow' => [...$this->flow(), 'created_at' => time() - $age]]);
        }

        $this->get('/auth/oidc/callback?state='.$state.'&code=test-code')->assertRedirect('/login')->assertSessionHasErrors('oidc')->assertSessionMissing('oidc_flow');

        $this->assertGuest();
        Http::assertNothingSent();
        $this->assertDatabaseCount('users', 0);
    }

    public static function invalidClaims(): array
    {
        return [
            'issuer' => [['iss' => 'https://other.example.test/']],
            'audience' => [['aud' => 'another-app']],
            'multiple audiences without azp' => [['aud' => ['opdracht', 'another-app']]],
            'wrong azp' => [['azp' => 'another-app']],
            'nonce' => [['nonce' => 'wrong-nonce']],
            'missing nonce' => [['nonce' => null]],
            'expired' => [['exp' => 1]],
            'missing expiry' => [['exp' => null]],
            'future issued' => [['iat' => 9999999999]],
            'missing issued' => [['iat' => null]],
            'empty subject' => [['sub' => '']],
            'missing email for new user' => [['email' => null]],
        ];
    }

    #[DataProvider('invalidClaims')]
    public function test_invalid_signed_claims_do_not_authenticate_or_provision(array $claims): void
    {
        $this->fakeProvider($claims);

        $this->withSession(['oidc_flow' => $this->flow()])->get('/auth/oidc/callback?state=expected-state&code=test-code')
            ->assertRedirect('/login')->assertSessionHasErrors('oidc')->assertSessionMissing('oidc_flow');

        $this->assertGuest();
        $this->assertDatabaseCount('users', 0);
    }

    public function test_invalid_signature_is_rejected(): void
    {
        $this->fakeProvider([], true);

        $this->withSession(['oidc_flow' => $this->flow()])->get('/auth/oidc/callback?state=expected-state&code=test-code')->assertSessionHasErrors('oidc');

        $this->assertGuest();
        $this->assertDatabaseCount('users', 0);
    }

    public function test_provider_denial_does_not_exchange_code_or_display_provider_content(): void
    {
        $this->withSession(['oidc_flow' => $this->flow()])->get('/auth/oidc/callback?state=expected-state&error=access_denied&error_description=secret')
            ->assertRedirect('/login')->assertSessionHasErrors(['oidc' => 'Die Anmeldung wurde nicht freigegeben.']);

        Http::assertNothingSent();
        $this->assertGuest();
    }

    public function test_discovery_mismatch_does_not_redirect_to_provider(): void
    {
        Http::fake([self::ISSUER.'.well-known/openid-configuration' => Http::response([...$this->metadata(), 'issuer' => 'https://wrong.example.test/'])]);

        $this->get('/auth/oidc')->assertRedirect('/login')->assertSessionHasErrors('oidc')->assertSessionMissing('oidc_flow');
        Http::assertSentCount(1);
    }

    public function test_discovery_cannot_send_client_credentials_to_another_origin(): void
    {
        Http::fake([self::ISSUER.'.well-known/openid-configuration' => Http::response([...$this->metadata(), 'token_endpoint' => 'https://other.example.test/token'])]);

        $this->get('/auth/oidc')->assertRedirect('/login')->assertSessionHasErrors('oidc')->assertSessionMissing('oidc_flow');

        Http::assertSentCount(1);
    }

    public function test_provider_outage_has_a_recoverable_error_and_leaks_no_response_body(): void
    {
        Http::fake([self::ISSUER.'.well-known/openid-configuration' => Http::response('private-provider-details', 503)]);

        $this->get('/auth/oidc')->assertRedirect('/login')->assertSessionHasErrors(['oidc' => 'Anmeldung über Authentik nicht möglich. Bitte erneut versuchen oder die Administration kontaktieren.']);

        $this->assertGuest();
        Http::assertSentCount(1);
    }

    public function test_disabled_oidc_and_local_login_cannot_be_bypassed_by_direct_requests(): void
    {
        config(['oidc.enabled' => false, 'oidc.local_login' => false]);
        $user = User::factory()->create(['password' => 'valid-password']);

        $this->get('/auth/oidc')->assertNotFound();
        $this->get('/auth/oidc/callback')->assertNotFound();
        $this->post('/login', ['email' => $user->email, 'password' => 'valid-password'])->assertForbidden();
        $this->assertGuest();
        Http::assertNothingSent();
    }

    public function test_login_exposes_authentik_and_can_hide_local_credentials(): void
    {
        config(['oidc.local_login' => false]);
        $this->get('/login')->assertOk()->assertSee('Mit Authentik anmelden')->assertDontSee('name="password"', false);
    }

    private function flow(): array
    {
        return ['state' => 'expected-state', 'nonce' => 'expected-nonce', 'verifier' => str_repeat('v', 96), 'created_at' => time()];
    }

    private function metadata(): array
    {
        return ['issuer' => self::ISSUER,
            'authorization_endpoint' => 'https://auth.example.test/application/o/authorize/',
            'token_endpoint' => 'https://auth.example.test/application/o/token/',
            'jwks_uri' => self::ISSUER.'jwks/'];
    }

    private function fakeProvider(array $overrides = [], bool $badSignature = false): void
    {
        $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        $details = openssl_pkey_get_details($key);
        $claims = array_filter(array_replace(['iss' => self::ISSUER, 'aud' => 'opdracht', 'sub' => 'authentik-user-1',
            'iat' => time() - 5, 'exp' => time() + 300, 'nonce' => 'expected-nonce',
            'email' => 'person@example.test', 'name' => 'Test Person'], $overrides), fn ($value): bool => $value !== null);
        $signingKey = $badSignature ? openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]) : $key;
        $token = JWT::encode($claims, $signingKey, 'RS256', 'test-key');
        Http::fake([
            self::ISSUER.'.well-known/openid-configuration' => Http::response($this->metadata()),
            'https://auth.example.test/application/o/token/' => Http::response(['id_token' => $token, 'access_token' => 'unused-token']),
            self::ISSUER.'jwks/' => Http::response(['keys' => [['kid' => 'test-key', 'kty' => 'RSA', 'alg' => 'RS256', 'use' => 'sig',
                'n' => JWT::urlsafeB64Encode($details['rsa']['n']), 'e' => JWT::urlsafeB64Encode($details['rsa']['e'])]]]),
        ]);
    }
}
