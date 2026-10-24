/** validate(schema, 'body' | 'query' | 'params') -> replaces the request part with the parsed (typed, trimmed) value. */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) return next(result.error);
  req[source] = result.data;
  next();
};
