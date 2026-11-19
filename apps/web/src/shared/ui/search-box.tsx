import { useState, type FormEvent } from 'react';
import { Button } from './button';
import { Field } from './field';
import { Input } from './input';

interface Props {
  id: string;
  initial: string;
  placeholder: string;
  onSearch: (value: string | undefined) => void;
}

/** A search form. Key it by the URL's search term so it resets on Clear and Back. */
export function SearchBox({ id, initial, placeholder, onSearch }: Props) {
  const [term, setTerm] = useState(initial);
  return (
    <form
      role="search"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSearch(term.trim() || undefined);
      }}
      className="flex items-end gap-2"
    >
      <Field id={id} label="Search" className="w-64 max-w-full">
        <Input
          className="h-10"
          type="search"
          placeholder={placeholder}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          maxLength={100}
        />
      </Field>
      <Button type="submit" size="lg" variant="secondary" className="h-10">
        Search
      </Button>
    </form>
  );
}
