<?php
/*
 * Website Factory contact form handler (static hosting with PHP mail()).
 * Factory-authored and integrity-checked — agents cannot modify it.
 * - POST only, same-origin check, honeypot + time trap, per-IP rate limit (hashed IP, no content logging)
 * - strict validation and header-injection protection; message content is never stored.
 */
declare(strict_types=1);
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

$config = require __DIR__ . '/kontakt-config.php';
$back = $config['redirect'] ?? 'kontakt.html';

function wf_done(string $back, string $status): void {
    header('Location: ' . $back . '?status=' . rawurlencode($status), true, 303);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); header('Allow: POST'); exit; }

$host = $_SERVER['HTTP_HOST'] ?? '';
$origin = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== preg_replace('/:\d+$/', '', $host)) { wf_done($back, 'error'); }

// Honeypot and minimum fill time (bots).
if (!empty($_POST['website'] ?? '')) { wf_done($back, 'ok'); }
$t = (int)($_POST['wf_t'] ?? 0);
if ($t > 0 && (time() - $t) < 3) { wf_done($back, 'error'); }

// Rate limit: 5 submissions per hour per hashed IP.
$ipHash = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . ($config['salt'] ?? ''));
$rlFile = sys_get_temp_dir() . '/wf-rl-' . substr($ipHash, 0, 32);
$hits = array_filter(is_file($rlFile) ? (array)json_decode((string)file_get_contents($rlFile), true) : [], fn($ts) => is_int($ts) && $ts > time() - 3600);
if (count($hits) >= 5) { wf_done($back, 'limit'); }
$hits[] = time();
@file_put_contents($rlFile, json_encode(array_values($hits)), LOCK_EX);

$clean = fn(string $k, int $max) => trim(mb_substr((string)($_POST[$k] ?? ''), 0, $max));
$name = $clean('name', 120);
$email = $clean('email', 200);
$phone = $clean('phone', 60);
$message = $clean('message', 5000);

if ($name === '' || $message === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) { wf_done($back, 'invalid'); }
foreach ([$name, $email, $phone] as $v) { if (preg_match('/[\r\n]|%0a|%0d/i', $v)) { wf_done($back, 'invalid'); } }

$to = (string)$config['to'];
$subject = '=?UTF-8?B?' . base64_encode('Kontaktanfrage über ' . (string)$config['site']) . '?=';
$body = "Name: {$name}\nE-Mail: {$email}\n" . ($phone !== '' ? "Telefon: {$phone}\n" : '') . "\nNachricht:\n{$message}\n";
$headers = [
    'From: ' . $to,
    'Reply-To: ' . $email,
    'Content-Type: text/plain; charset=UTF-8',
    'X-Mailer: WebsiteFactory',
];
$ok = @mail($to, $subject, $body, implode("\r\n", $headers));
wf_done($back, $ok ? 'ok' : 'error');
