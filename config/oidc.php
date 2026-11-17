<?php

return [
    'enabled' => env('OIDC_ENABLED', false),
    'issuer' => env('OIDC_ISSUER', ''),
    'client_id' => env('OIDC_CLIENT_ID', ''),
    'client_secret' => env('OIDC_CLIENT_SECRET', ''),
    'redirect_uri' => env('OIDC_REDIRECT_URI') ?: rtrim(env('APP_URL', 'http://localhost:8080'), '/').'/auth/oidc/callback',
    'local_login' => env('OIDC_LOCAL_LOGIN', true),
];
