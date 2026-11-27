// Mantine's link-like components, bound to the router so that their `to`, `params` and `search`
// are checked against the routes.

import { Anchor, Button, NavLink, type AnchorProps, type ButtonProps, type NavLinkProps } from "@mantine/core";
import { createLink } from "@tanstack/react-router";
import type { AnchorHTMLAttributes, Ref } from "react";

type AnchorAttributes = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "color" | "style">;

export const AnchorLink = createLink((props: AnchorProps & AnchorAttributes & { ref?: Ref<HTMLAnchorElement> }) => <Anchor {...props} />);
export const ButtonLink = createLink((props: ButtonProps & AnchorAttributes & { ref?: Ref<HTMLAnchorElement> }) => <Button component="a" {...props} />);
export const NavItemLink = createLink((props: NavLinkProps & Omit<AnchorAttributes, "onChange"> & { ref?: Ref<HTMLAnchorElement> }) => (
  <NavLink component="a" {...props} />
));
