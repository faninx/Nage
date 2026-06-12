CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`space_id` integer NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`color` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `categories_space_idx` ON `categories` (`space_id`);--> statement-breakpoint
CREATE TABLE `item_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`path` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `item_tags` (
	`item_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`item_id`, `tag_id`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`space_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`category_id` integer,
	`location_id` integer,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit` text,
	`value` integer,
	`expired_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `items_space_idx` ON `items` (`space_id`);--> statement-breakpoint
CREATE INDEX `items_category_idx` ON `items` (`category_id`);--> statement-breakpoint
CREATE INDEX `items_location_idx` ON `items` (`location_id`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`space_id` integer NOT NULL,
	`parent_id` integer,
	`name` text NOT NULL,
	`description` text,
	`cover_image` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `locations_space_idx` ON `locations` (`space_id`);--> statement-breakpoint
CREATE INDEX `locations_parent_idx` ON `locations` (`parent_id`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`username` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`last_attempt_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spaces` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`owner_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `spaces_owner_idx` ON `spaces` (`owner_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`space_id` integer NOT NULL,
	`name` text NOT NULL,
	`color` text,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tags_space_idx` ON `tags` (`space_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`nickname` text NOT NULL,
	`avatar` text,
	`role` text DEFAULT 'member' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);