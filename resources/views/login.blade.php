<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#f7f8f2"><link rel="manifest" href="/manifest.webmanifest?v=5"><link rel="icon" href="/icons/icon.svg?v=5" type="image/svg+xml"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=5"><script src="/theme.js?v=6"></script><link rel="stylesheet" href="/app.css?v=16"><title>Anmelden · Opdracht</title></head>
<body class="login-body"><main class="login-wrap"><a class="brand" href="/"><span class="brand-mark">o</span>opdracht<span class="brand-dot">.</span></a><div class="login-card"><h1>Anmelden</h1>
@if(session('status'))<p class="notice">{{ session('status') }}</p>@endif
@if($errors->any())<p class="form-error" role="alert">{{ $errors->first() }}</p>@endif
@if(config('oidc.enabled'))
<a class="button primary wide oidc-login" href="{{ route('oidc.redirect') }}">Mit Authentik anmelden <span aria-hidden="true">↗</span></a>
@endif
@if(config('oidc.local_login', true))
<form action="/login" method="post">@csrf<label>E-Mail<input type="email" name="email" value="{{ old('email') }}" autocomplete="username" required autofocus></label><label>Passwort<input type="password" name="password" autocomplete="current-password" required></label><label class="check-label"><input type="checkbox" name="remember" value="1"> Angemeldet bleiben</label><button type="submit" class="button primary wide">Anmelden <span aria-hidden="true">↗</span></button></form>
@endif
</div></main><script>if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js?v=16').catch(error => console.error('Opdracht service worker:', error));</script></body>
</html>
