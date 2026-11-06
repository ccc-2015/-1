declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(
    handler: (request: Request) => Response | Promise<Response>,
    options?: { hostname?: string; port?: number },
  ): void;
};
