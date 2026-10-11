import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clearPortalCookie, clearPortalOAuthCookie } from './portal.mjs';
import { AppError, errorBody, assert } from './errors.mjs';
import { readBody, parseJson, parseMultipart, MAX_REQUEST_BYTES } from './multipart.mjs';
import { SITE_MAX_UPLOAD_REQUEST_BYTES } from './site.mjs';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const assets = new Map([['portal.css', 'text/css; charset=utf-8'], ['portal.js', 'text/javascript; charset=utf-8'], ['icons.svg', 'image/svg+xml'], ['background-batto.jpeg', 'image/jpeg']]);
const siteAssets = new Map([['site.css', 'text/css; charset=utf-8'], ['site.js', 'text/javascript; charset=utf-8'], ['icons.svg', 'image/svg+xml'], ['brand-dragon.jpeg', 'image/jpeg'], ['discord-app.png', 'image/png']]);
const showcasePages = new Map([
  ['/', 'index.html'], ['/index.html', 'index.html'],
  ['/altes-setup.html', 'altes-setup.html'], ['/gaming-setup.html', 'gaming-setup.html'],
  ['/software.html', 'software.html'], ['/discord-app.html', 'discord-app.html'],
  ['/registrierung.html', 'registrierung.html'], ['/portal', 'registrierung.html'], ['/portal/', 'registrierung.html']
]);
// Only the reviewed website files receive public routes. Source material,
// private releases and owner uploads are never exposed by this static handler.
const showcaseAssets = new Map([
  ['08_ROG-Maus_Ansicht-06.png', 'image/png'],
  ['13_Anfang_bearbeitet.png', 'image/png'],
  ['14_Altes-Setup_bearbeitet.png', 'image/png'],
  ['15_Kraken-G12_bearbeitet.png', 'image/png'],
  ['16_Ganzes-Setup_bearbeitet.png', 'image/png'],
  ['23_PC-Aufbau_ohne-Rohre_bearbeitet.png', 'image/png'],
  ['24_Wasserkuehlung_Rote-Rohre_Detail-1.png', 'image/png'],
  ['25_Wasserkuehlung_Rote-Rohre_Detail-2.png', 'image/png'],
  ['discord-app.png', 'image/png'],
  ['gaming-1.jpg', 'image/jpeg'],
  ['gaming-2.jpg', 'image/jpeg'],
  ['gaming-3.jpg', 'image/jpeg'],
  ['gaming-4.jpg', 'image/jpeg'],
  ['gaming-7.jpeg', 'image/jpeg'],
  ['gaming-rgb-slotcover.jpeg', 'image/jpeg'],
  ['gaming-wasserkuehlung-front.jpg', 'image/jpeg'],
  ['header-poster.webp', 'image/webp'],
  ['header.gif', 'image/gif'],
  ['logo.jpeg', 'image/jpeg'],
  ['marble-gold.webp', 'image/webp'],
  ['portrait.png', 'image/png'],
  ['site.css', 'text/css; charset=utf-8'],
  ['site.js', 'text/javascript; charset=utf-8'],
  ['software-luefterkurven.jpg', 'image/jpeg'],
  ['software-multi-chat.jpg', 'image/jpeg'],
  ['software-rgb.jpg', 'image/jpeg'],
  ['software-start.jpg', 'image/jpeg'],
  ['software-strimer.jpg', 'image/jpeg'],
  ['software-touch-deck.jpg', 'image/jpeg'],
  ['software-uebersicht.jpg', 'image/jpeg'],
  ['software-widgets.jpg', 'image/jpeg']
]);
const portalCsp = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https://cdn.discordapp.com data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const siteCsp = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
function readCookie(header, name) {
  const values = String(header || '').split(';').map(value => value.trim()).filter(value => value.startsWith(name + '='));
  if (values.length !== 1) return undefined;
  const value = values[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{32,128}$/.test(value) ? value : undefined;
}

const htmlEscape = value => String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

function page(title, body) {
  return '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + htmlEscape(title) + ' · Crazy_Batto Discord App</title><style>html{color-scheme:dark}body{font-family:system-ui,sans-serif;background:#101522;color:#eef3ff;margin:0;padding:40px 20px}main{max-width:520px;margin:8vh auto;padding:28px;background:#1b2335;border-radius:22px;border:1px solid #33425b}h1{font-size:26px}p{line-height:1.6}strong{color:#84e5c1}code{display:block;font-size:28px;letter-spacing:3px;padding:16px;background:#101522;border-radius:12px;text-align:center}</style></head><body><main><p>CRAZY_BATTO DISCORD APP</p><h1>' + htmlEscape(title) + '</h1>' + body + '</main></body></html>';
}

export function createHttpServer(service, { rateLimits = true } = {}) {
  const limits = new Map();
  const limited = (key, maximum, windowMs) => {
    if (!rateLimits) return;
    const now = service.now();
    if (limits.size > 5000) for (const [name, limit] of limits) if (limit.until <= now) limits.delete(name);
    let limit = limits.get(key);
    if (!limit || limit.until <= now) { limit = { count: 0, until: now + windowMs }; limits.set(key, limit); }
    if (++limit.count > maximum) throw new AppError('rate_limited', 'Zu viele Anfragen. Bitte einen Moment warten.', 429, limit.until - now);
  };
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    let pathname = '';
    const json = async (maximum = 64 * 1024) => {
      assert(/^application\/json(?:;|$)/i.test(request.headers['content-type'] || ''), 'Die Anfrage muss JSON enthalten.', 'validation', 415);
      return parseJson(await readBody(request, maximum));
    };
    const streamFile = (filename, contentType, downloadName = null) => {
      let fd;
      try {
        fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        const stat = fs.fstatSync(fd);
        assert(stat.isFile() && stat.size > 0, downloadName ? 'Die APK wurde auf diesem Server noch nicht bereitgestellt.' : 'Diese Datei ist nicht verfügbar.', 'unconfigured', 503);
        response.setHeader('Content-Type', contentType);
        response.setHeader('Content-Length', stat.size);
        if (downloadName) { response.setHeader('Content-Disposition', 'attachment; filename="' + downloadName + '"'); response.setHeader('Cache-Control', 'private, no-store, max-age=0'); response.setHeader('Vary', 'Cookie'); }
        if (request.method === 'HEAD') { fs.closeSync(fd); fd = undefined; response.writeHead(200); response.end(); return; }
        const stream = fs.createReadStream(filename, { fd, autoClose: true }); fd = undefined;
        stream.on('error', () => response.destroy());
        response.on('close', () => stream.destroy());
        response.writeHead(200); stream.pipe(response);
      } catch (cause) {
        if (fd !== undefined) fs.closeSync(fd);
        if (cause instanceof AppError) throw cause;
        throw new AppError('unconfigured', downloadName ? 'Die APK wurde auf diesem Server noch nicht bereitgestellt. Bitte später erneut versuchen.' : 'Die Website wurde auf diesem Server noch nicht bereitgestellt.', 503);
      }
    };
    const send = (value, status = 200) => { if (response.writableEnded || response.destroyed) return; if (response.headersSent) { response.destroy(); return; } response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)); };
    const sendPage = (title, body, status = 200) => { if (response.writableEnded || response.destroyed) return; if (response.headersSent) { response.destroy(); return; } response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(page(title, body)); };
    try {
      const url = new URL(request.url, 'http://modstempel.local'); pathname = url.pathname;
      if (request.method === 'GET' && pathname === '/health') return send(service.health());
      const forwarded = service.config.trustProxy && typeof request.headers['x-forwarded-for'] === 'string' ? request.headers['x-forwarded-for'].split(',').at(-1).trim() : '';
      const remote = forwarded || request.socket.remoteAddress || 'unknown';
      if (showcasePages.has(pathname)) {
        assert(['GET', 'HEAD'].includes(request.method), 'Diese Website unterstützt nur das Öffnen.', 'validation', 405);
        limited('showcase:' + remote, 360, 60_000);
        const filename = showcasePages.get(pathname);
        response.setHeader('Content-Security-Policy', filename === 'registrierung.html' ? portalCsp : siteCsp);
        return streamFile(path.join(publicDir, 'showcase', filename), 'text/html; charset=utf-8');
      }
      if (pathname.startsWith('/assets/')) {
        assert(['GET', 'HEAD'].includes(request.method), 'Diese Datei unterstützt nur das Öffnen.', 'validation', 405);
        limited('showcase:' + remote, 360, 60_000);
        const name = pathname.slice('/assets/'.length);
        assert(showcaseAssets.has(name), 'Diese Datei ist nicht vorhanden.', 'not_found', 404);
        response.setHeader('Content-Security-Policy', siteCsp);
        return streamFile(path.join(publicDir, 'showcase', 'assets', name), showcaseAssets.get(name));
      }
      if (['/site', '/site/'].includes(pathname)) {
        assert(['GET', 'HEAD'].includes(request.method), 'Diese Website unterstützt nur das Öffnen.', 'validation', 405);
        response.setHeader('Content-Security-Policy', siteCsp);
        return streamFile(path.join(publicDir, 'site/index.html'), 'text/html; charset=utf-8');
      }
      if (pathname.startsWith('/site/')) {
        limited('site:' + remote, 360, 60_000);
        if (request.method === 'GET' && pathname === '/site/api/content') return send(service.site.publicContent());
        if (pathname.startsWith('/site/assets/')) {
          assert(['GET', 'HEAD'].includes(request.method), 'Diese Datei unterstützt nur das Öffnen.', 'validation', 405);
          const name = pathname.slice('/site/assets/'.length);
          assert(siteAssets.has(name), 'Diese Datei ist nicht vorhanden.', 'not_found', 404);
          response.setHeader('Content-Security-Policy', siteCsp);
          return streamFile(path.join(publicDir, 'site', name), siteAssets.get(name));
        }
        const media = /^\/site\/media\/(img_[a-f0-9]{64})$/.exec(pathname);
        if (media && ['GET', 'HEAD'].includes(request.method)) {
          const file = service.site.imageFile(media[1], { publicOnly: true });
          return streamFile(file.filename, file.mimeType);
        }
        throw new AppError('not_found', 'Diese Website-Adresse ist nicht vorhanden.', 404);
      }
      if (pathname.startsWith('/portal/assets/')) {
        assert(['GET', 'HEAD'].includes(request.method), 'Diese Datei unterstützt nur das Öffnen.', 'validation', 405);
        const name = pathname.slice('/portal/assets/'.length);
        assert(assets.has(name), 'Diese Datei ist nicht vorhanden.', 'not_found', 404);
        response.setHeader('Content-Security-Policy', portalCsp);
        return streamFile(path.join(publicDir, name), assets.get(name));
      }
      if (pathname.startsWith('/portal/')) {
        limited('portal:' + remote, 180, 60_000);
        const portalToken = readCookie(request.headers.cookie, 'ms_portal');
        if (pathname === '/portal/login') {
          assert(request.method === 'GET', 'Die Anmeldung muss im Browser geöffnet werden.', 'validation', 405);
          limited('portal-login:' + remote, 20, 10 * 60_000);
          const start = service.portal.start();
          response.writeHead(302, { Location: start.url, 'Set-Cookie': start.cookie }); return response.end();
        }
        if (pathname === '/portal/callback') {
          assert(request.method === 'GET', 'Diese Anmeldung unterstützt nur das Öffnen.', 'validation', 405);
          const result = await service.portal.callback({ state: url.searchParams.get('state'), code: url.searchParams.get('code'), error: url.searchParams.get('error'), browserSecret: readCookie(request.headers.cookie, 'ms_portal_oauth'), previousToken: portalToken });
          response.writeHead(303, { Location: '/portal', 'Set-Cookie': [result.cookie, clearPortalOAuthCookie()] }); return response.end();
        }
        if (request.headers.origin && request.headers.origin !== service.config.publicOrigin) throw new AppError('forbidden', 'Diese Browser-Anfrage gehört nicht zur Website der Crazy_Batto Discord App.', 403);
        if (request.method === 'GET' && pathname === '/portal/api/session') return send(service.portal.info(service.portal.session(portalToken, { optional: true })));
        const portalSession = service.portal.session(portalToken);
        if (['GET', 'HEAD'].includes(request.method) && pathname === '/portal/download') {
          service.access.requireApprovedUser(portalSession.userId);
          limited('download:' + portalSession.userId, 12, 60_000);
          return streamFile(service.config.apkPath, 'application/vnd.android.package-archive', service.config.apkFilename);
        }
        if (request.method === 'POST' && ['/portal/api/register', '/portal/api/logout'].includes(pathname)) {
          service.portal.requireCsrf(portalSession, request.headers);
          const body = await json();
          const current = service.portal.session(portalToken);
          service.portal.requireCsrf(current, request.headers);
          if (pathname.endsWith('/register')) {
            limited('register:' + current.userId, 10, 60_000);
            return send(service.access.register(current.userId, body));
          }
          const result = service.portal.logout(current);
          response.setHeader('Set-Cookie', clearPortalCookie()); return send(result);
        }
        throw new AppError('not_found', 'Diese Portal-Aktion ist nicht vorhanden.', 404);
      }
      if (pathname.startsWith('/oauth/')) {
        limited('browser:' + remote, 80, 10 * 60_000);
        assert(request.method === 'GET', 'Diese Browser-Adresse unterstützt nur das Öffnen.', 'validation', 405);
        const match = /^\/oauth\/start\/([A-Za-z0-9_-]{16,128})$/.exec(pathname);
        if (match) {
          const start = service.auth.browserStart(match[1]);
          response.writeHead(302, { Location: start.url, 'Set-Cookie': start.cookie }); return response.end();
        }
        if (pathname === '/oauth/callback') {
          const browserSecret = /(?:^|;\s*)ms_oauth=([A-Za-z0-9_-]+)/.exec(request.headers.cookie || '')?.[1];
          const result = await service.auth.callback({ state: url.searchParams.get('state'), code: url.searchParams.get('code'), error: url.searchParams.get('error'), browserSecret });
          response.setHeader('Set-Cookie', 'ms_oauth=; HttpOnly; Secure; SameSite=Lax; Path=/oauth; Max-Age=0');
          return sendPage('Discord-Anmeldung bestätigt', '<p>Angemeldet als <strong>' + htmlEscape(result.user.displayName) + '</strong>.</p><p>Diese Anmeldung gehört zum Gerätecode:</p><code>' + htmlEscape(result.displayCode) + '</code><p>Wechsle jetzt zurück zur Crazy_Batto Discord App. Die App übernimmt die bestätigte Anmeldung automatisch. Falls du diese Anmeldung nicht selbst gestartet hast, bestätige den Gerätecode nicht in einer fremden App und beende die Anmeldung in Discord.</p>');
        }
        throw new AppError('not_found', 'Diese Anmeldeseite ist nicht vorhanden.', 404);
      }
      if (!pathname.startsWith('/v2/')) throw new AppError('not_found', 'Diese Server-Adresse ist nicht vorhanden.', 404);
      if (request.headers.origin && request.headers.origin !== service.config.publicOrigin) throw new AppError('forbidden', 'Dieser Browser-Ursprung ist nicht für die App freigegeben.', 403);
      if (request.method === 'POST' && pathname === '/v2/auth/start') {
        limited('auth-start:' + remote, 20, 10 * 60_000);
        return send(service.auth.start((await json()).challenge));
      }
      if (request.method === 'POST' && ['/v2/auth/poll', '/v2/auth/cancel'].includes(pathname)) {
        limited('auth-poll:' + remote, 100, 60_000);
        const body = await json();
        return send(pathname.endsWith('/poll') ? service.auth.poll(body.loginId, body.verifier) : service.auth.cancel(body.loginId, body.verifier));
      }
      const token = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(request.headers.authorization || '')?.[1];
      const session = service.auth.session(token);
      limited('api:' + session.userId, 180, 60_000);
      if (request.method === 'GET' && pathname === '/v2/session') return send({ ok: true, user: session.user, expiresAt: session.expiresAt, access: service.access.state(session.userId) });
      if (request.method === 'POST' && pathname === '/v2/auth/logout') return send(service.auth.logout(session));
      if (pathname.startsWith('/v2/admin/')) {
        service.access.requireOwner(session);
        if (request.method === 'GET' && pathname === '/v2/admin/site') return send(service.site.admin(session));
        if (request.method === 'POST' && pathname === '/v2/admin/site') return send(service.site.save(session, await json()));
        if (request.method === 'POST' && pathname === '/v2/admin/site/publish') return send(service.site.publish(session, await json()));
        if (request.method === 'POST' && pathname === '/v2/admin/site/images') {
          limited('site-upload:' + session.userId, 30, 60_000);
          return send(service.site.upload(session, await json(SITE_MAX_UPLOAD_REQUEST_BYTES)));
        }
        const siteImage = /^\/v2\/admin\/site\/images\/(img_[a-f0-9]{64}|brand-dragon|discord-app)$/.exec(pathname);
        if (siteImage && ['GET', 'HEAD'].includes(request.method)) {
          service.access.requireOwner(session);
          const file = service.site.imageFile(siteImage[1]);
          response.setHeader('Vary', 'Authorization');
          return streamFile(file.filename, file.mimeType);
        }
        if (siteImage && request.method === 'DELETE') return send(service.site.deleteImage(session, siteImage[1]));
        if (request.method === 'GET' && pathname === '/v2/admin/summary') return send(service.access.summary(session));
        if (request.method === 'GET' && pathname === '/v2/admin/registrations') {
          const rawLimit = url.searchParams.get('limit'), rawOffset = url.searchParams.get('offset');
          assert((rawLimit === null || /^\d{1,3}$/.test(rawLimit)) && (rawOffset === null || /^\d{1,9}$/.test(rawOffset)), 'Die Seitenauswahl ist ungültig.');
          return send(service.access.list(session, { status: url.searchParams.get('status') || 'all', limit: rawLimit === null ? 100 : Number(rawLimit), offset: rawOffset === null ? 0 : Number(rawOffset) }));
        }
        const decision = /^\/v2\/admin\/registrations\/(\d{17,20})\/decision$/.exec(pathname);
        if (request.method === 'POST' && decision) return send(service.access.decide(session, decision[1], await json()));
        throw new AppError('not_found', 'Diese Betreiber-Aktion ist nicht vorhanden.', 404);
      }
      service.access.requireApp(session);
      if (request.method === 'GET' && pathname === '/v2/guilds') return send(await service.guilds(session));
      const guild = /^\/v2\/guilds\/(\d{17,20})\/(setup|moderator-role|install|events)$/.exec(pathname);
      if (guild) {
        if (request.method === 'GET' && guild[2] === 'setup') return send(await service.setup(session, guild[1]));
        if (request.method === 'PUT' && guild[2] === 'moderator-role') return send(await service.setModeratorRole(session, guild[1], (await json()).roleId));
        if (request.method === 'GET' && guild[2] === 'install') return send(await service.install(session, guild[1]));
        if (request.method === 'GET' && guild[2] === 'events') return send(await service.scheduledEvents(session, guild[1]));
        throw new AppError('validation', 'Diese Aktion unterstützt die angegebene Methode nicht.', 405);
      }
      if (request.method === 'POST' && pathname === '/v2/operations') {
        limited('send:' + session.userId, 20, 60_000);
        const type = request.headers['content-type'] || '';
        if (/^multipart\/form-data(?:;|$)/i.test(type)) {
          const upload = parseMultipart(await readBody(request, MAX_REQUEST_BYTES), type);
          return send(await service.accept(session, upload.operation, upload.image));
        }
        return send(await service.accept(session, (await json()).operation));
      }
      const operation = /^\/v2\/operations\/([A-Za-z0-9_-]{16,80})(?:\/(retry|poll))?$/.exec(pathname);
      if (operation) {
        if (request.method === 'GET' && !operation[2]) return send(service.operationStatus(session, operation[1]));
        if (request.method === 'GET' && operation[2] === 'poll') return send(await service.pollResults(session, operation[1]));
        if (request.method === 'POST' && operation[2] === 'retry') {
          limited('send:' + session.userId, 20, 60_000);
          return send(await service.retry(session, operation[1], (await json()).acknowledgeUncertain));
        }
        throw new AppError('validation', 'Diese Aktion unterstützt die angegebene Methode nicht.', 405);
      }
      throw new AppError('not_found', 'Diese Aktion ist nicht vorhanden.', 404);
    } catch (error) {
      const status = error instanceof AppError ? error.status : 500;
      if (error.retryAfterMs && !response.headersSent) response.setHeader('Retry-After', String(Math.ceil(error.retryAfterMs / 1000)));
      if (pathname === '/portal/callback' || pathname === '/portal/login') sendPage('Anmeldung nicht abgeschlossen', '<p>' + htmlEscape(errorBody(error).message) + '</p><p>Öffne die Website der Crazy_Batto Discord App erneut und starte die Anmeldung dort.</p>', status);
      else if (pathname.startsWith('/oauth/')) sendPage('Anmeldung nicht abgeschlossen', '<p>' + htmlEscape(errorBody(error).message) + '</p><p>Wechsle zurück zur App und starte die Anmeldung erneut.</p>', status);
      else send(errorBody(error), status);
    }
  });
  server.requestTimeout = 200_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5000;
  return server;
}
