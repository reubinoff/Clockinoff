// React 19 removed the global `JSX` namespace that came in from
// `@types/react@18`. The project still uses `JSX.Element` as a return-type
// shorthand across pages and components; expose the React 19 `JSX` namespace
// globally so that keeps compiling without touching every file.
//
// Context: https://github.com/facebook/react/pull/28222 (DefinitelyTyped
// `@types/react@19` moved `JSX` under `React` and dropped the global).

import type { JSX as ReactJSX } from "react";

declare global {
  namespace JSX {
    type ElementType = ReactJSX.ElementType;
    type Element = ReactJSX.Element;
    type ElementClass = ReactJSX.ElementClass;
    type ElementAttributesProperty = ReactJSX.ElementAttributesProperty;
    type ElementChildrenAttribute = ReactJSX.ElementChildrenAttribute;
    type LibraryManagedAttributes<C, P> = ReactJSX.LibraryManagedAttributes<C, P>;
    type IntrinsicAttributes = ReactJSX.IntrinsicAttributes;
    type IntrinsicClassAttributes<T> = ReactJSX.IntrinsicClassAttributes<T>;
    type IntrinsicElements = ReactJSX.IntrinsicElements;
  }
}

export {};
