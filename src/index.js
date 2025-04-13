addEventListener("fetch", (event) => {
  event.passThroughOnException();
  event.respondWith(handleRequest(event.request));
});

const dockerHub = "https://registry-1.docker.io";
const CUSTOM_DOMAIN = "docker.zhpjy.top";

const routes = {
  // production
  ["" + CUSTOM_DOMAIN]: dockerHub,
  ["quay." + CUSTOM_DOMAIN]: "https://quay.io",
  ["gcr." + CUSTOM_DOMAIN]: "https://gcr.io",
  ["k8s-gcr." + CUSTOM_DOMAIN]: "https://k8s.gcr.io",
  ["k8s." + CUSTOM_DOMAIN]: "https://registry.k8s.io",
  ["ghcr." + CUSTOM_DOMAIN]: "https://ghcr.io",
  ["cloudsmith." + CUSTOM_DOMAIN]: "https://docker.cloudsmith.io",
  ["ecr." + CUSTOM_DOMAIN]: "https://public.ecr.aws",

  // staging
  ["docker-staging." + CUSTOM_DOMAIN]: dockerHub,
};

function routeByHosts(host) {
  if (host in routes) {
    return routes[host];
  }
  return "";
}

const isDockerHub = upstream == dockerHub;
const DOCKER_REGISTRY = routeByHosts(url.hostname);
const PROXY_REGISTRY = url.hostname;

async function handleRequest(request) {
  const url = new URL(request.url)
  const path = url.pathname
  if (path === '/v2/') {
      return challenge(DOCKER_REGISTRY, url.host)
  } else if (path === '/auth/token') {
      return getToken(url)
  } else if (url.pathname === '/') {
      return home(url.host);
  }

  const parts = path.split('/')
  if (parts.length === 5) {
      parts.splice(2, 0, 'library')
      const newUrl = new URL(PROXY_REGISTRY)
      newUrl.pathname = parts.join('/')
      return Response.redirect(newUrl.toString(), 301)
  }

  return getData(DOCKER_REGISTRY, request)
}

async function challenge(upstream, host) {
  const url = new URL(upstream + '/v2/')
  const response = await fetch(url)
  const responseBody = await response.text()
  const headers = new Headers()
  headers.set('WWW-Authenticate', `Bearer realm="https://${host}/auth/token",service="docker-proxy-worker"`)
  return new Response(responseBody, { 
      status: response.status,
      statusText: response.statusText,
      headers
  })
}

async function getToken(originUrl) {
  let scope = processScope(originUrl)
  const url = new URL('https://auth.docker.io/token')
  url.searchParams.set('service', 'registry.docker.io')
  url.searchParams.set('scope', scope)
  const response = await fetch(url)
  return response
}

async function getData(upstream, req) {
  const originUrl = new URL(req.url)
  const url = new URL(upstream + originUrl.pathname)
  const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      redirect: 'follow'
  })

  const response = await fetch(request)
  return response
}

function processScope(url) {
  let scope = url.searchParams.get('scope')
  let parts = scope.split(':')
  if (parts.length === 3 && !parts[1].includes('/')) {
      parts[1] = 'library/' + parts[1]
      scope = parts.join(':')
  }
  return scope
}

function home(host) {
  return new Response(HTML.replace(/{:host}/g, host), {
      status: 200,
      headers: {
          "Content-Type": "text/html",
      }
  })
}