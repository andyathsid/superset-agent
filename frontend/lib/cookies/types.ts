export type CookieDefinition<T> = Readonly<{
  name: string;
  defaultValue: T;
  maxAge: number;
  parse: (value: string | undefined) => T;
  serialize: (value: T) => string;
}>;
