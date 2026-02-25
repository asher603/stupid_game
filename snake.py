"""
Snake Game - A simple pixel-style Snake game built with pygame.

Controls:
    Arrow Keys / WASD - Change direction
    P                 - Pause / Unpause
    R                 - Restart after game over
    ESC               - Quit

Author: Auto-generated
"""

import pygame
import random
import sys

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Display
CELL_SIZE = 20          # Size of each grid cell in pixels
GRID_WIDTH = 30         # Number of cells horizontally
GRID_HEIGHT = 20        # Number of cells vertically
SCREEN_WIDTH = CELL_SIZE * GRID_WIDTH    # 600
SCREEN_HEIGHT = CELL_SIZE * GRID_HEIGHT  # 400
INFO_BAR_HEIGHT = 40    # Height of the top info bar
WINDOW_WIDTH = SCREEN_WIDTH
WINDOW_HEIGHT = SCREEN_HEIGHT + INFO_BAR_HEIGHT

FPS = 10  # Game speed (frames per second)

# Colors (R, G, B)
COLOR_BG         = (15, 15, 26)       # Dark background
COLOR_GRID       = (25, 25, 40)       # Subtle grid lines
COLOR_SNAKE_HEAD = (0, 230, 118)      # Bright green head
COLOR_SNAKE_BODY = (0, 180, 90)       # Darker green body
COLOR_FOOD       = (255, 82, 82)      # Red food
COLOR_FOOD_GLOW  = (255, 120, 120)    # Food inner glow
COLOR_TEXT       = (220, 220, 220)    # White-ish text
COLOR_INFO_BG    = (10, 10, 20)       # Info bar background
COLOR_BORDER     = (60, 60, 100)      # Border color
COLOR_GAME_OVER  = (255, 60, 60)      # Game over text

# Directions
UP    = (0, -1)
DOWN  = (0, 1)
LEFT  = (-1, 0)
RIGHT = (1, 0)


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def random_food_position(snake_body: list[tuple[int, int]]) -> tuple[int, int]:
    """Return a random grid position that is not occupied by the snake."""
    while True:
        pos = (random.randint(0, GRID_WIDTH - 1), random.randint(0, GRID_HEIGHT - 1))
        if pos not in snake_body:
            return pos


def draw_rounded_rect(surface: pygame.Surface, color: tuple, rect: pygame.Rect, radius: int = 4):
    """Draw a rectangle with slightly rounded corners."""
    pygame.draw.rect(surface, color, rect, border_radius=radius)


# ---------------------------------------------------------------------------
# Game class
# ---------------------------------------------------------------------------

class SnakeGame:
    """Main game class that manages state, input, and rendering."""

    def __init__(self):
        pygame.init()
        self.screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
        pygame.display.set_caption("Snake Game")
        self.clock = pygame.time.Clock()
        self.font_big = pygame.font.SysFont("Consolas", 32, bold=True)
        self.font_small = pygame.font.SysFont("Consolas", 18)
        self.font_info = pygame.font.SysFont("Consolas", 16)
        self.reset()

    # ----- State management ------------------------------------------------

    def reset(self):
        """Reset the game to its initial state."""
        center_x = GRID_WIDTH // 2
        center_y = GRID_HEIGHT // 2
        self.snake = [(center_x, center_y),
                      (center_x - 1, center_y),
                      (center_x - 2, center_y)]
        self.direction = RIGHT
        self.next_direction = RIGHT
        self.food = random_food_position(self.snake)
        self.score = 0
        self.high_score = getattr(self, "high_score", 0)
        self.game_over = False
        self.paused = False

    # ----- Input handling --------------------------------------------------

    def handle_events(self):
        """Process keyboard and window events."""
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()

            if event.type == pygame.KEYDOWN:
                # Quit
                if event.key == pygame.K_ESCAPE:
                    pygame.quit()
                    sys.exit()

                # Restart after game over
                if event.key == pygame.K_r and self.game_over:
                    self.reset()
                    return

                # Pause toggle
                if event.key == pygame.K_p and not self.game_over:
                    self.paused = not self.paused
                    return

                # Direction input (prevent 180-degree turns)
                if event.key in (pygame.K_UP, pygame.K_w):
                    if self.direction != DOWN:
                        self.next_direction = UP
                elif event.key in (pygame.K_DOWN, pygame.K_s):
                    if self.direction != UP:
                        self.next_direction = DOWN
                elif event.key in (pygame.K_LEFT, pygame.K_a):
                    if self.direction != RIGHT:
                        self.next_direction = LEFT
                elif event.key in (pygame.K_RIGHT, pygame.K_d):
                    if self.direction != LEFT:
                        self.next_direction = RIGHT

    # ----- Game logic ------------------------------------------------------

    def update(self):
        """Advance the game by one tick."""
        if self.game_over or self.paused:
            return

        self.direction = self.next_direction

        # Compute new head position
        head_x, head_y = self.snake[0]
        dx, dy = self.direction
        new_head = (head_x + dx, head_y + dy)

        # Check wall collision
        if not (0 <= new_head[0] < GRID_WIDTH and 0 <= new_head[1] < GRID_HEIGHT):
            self._end_game()
            return

        # Check self collision
        if new_head in self.snake:
            self._end_game()
            return

        # Move snake
        self.snake.insert(0, new_head)

        # Check food collision
        if new_head == self.food:
            self.score += 1
            if self.score > self.high_score:
                self.high_score = self.score
            self.food = random_food_position(self.snake)
        else:
            self.snake.pop()  # Remove tail if no food eaten

    def _end_game(self):
        """Set game over state."""
        self.game_over = True

    # ----- Rendering -------------------------------------------------------

    def draw(self):
        """Render the entire frame."""
        self.screen.fill(COLOR_BG)
        self._draw_grid()
        self._draw_food()
        self._draw_snake()
        self._draw_info_bar()
        self._draw_border()

        if self.game_over:
            self._draw_overlay("GAME OVER", "Press R to restart", COLOR_GAME_OVER)
        elif self.paused:
            self._draw_overlay("PAUSED", "Press P to resume", COLOR_TEXT)

        pygame.display.flip()

    def _draw_grid(self):
        """Draw subtle grid lines on the play area."""
        offset_y = INFO_BAR_HEIGHT
        for x in range(0, SCREEN_WIDTH, CELL_SIZE):
            pygame.draw.line(self.screen, COLOR_GRID, (x, offset_y), (x, WINDOW_HEIGHT))
        for y in range(offset_y, WINDOW_HEIGHT, CELL_SIZE):
            pygame.draw.line(self.screen, COLOR_GRID, (0, y), (SCREEN_WIDTH, y))

    def _draw_snake(self):
        """Draw the snake with a distinct head and body."""
        offset_y = INFO_BAR_HEIGHT
        for i, (gx, gy) in enumerate(self.snake):
            rect = pygame.Rect(gx * CELL_SIZE + 1, gy * CELL_SIZE + offset_y + 1,
                               CELL_SIZE - 2, CELL_SIZE - 2)
            color = COLOR_SNAKE_HEAD if i == 0 else COLOR_SNAKE_BODY
            draw_rounded_rect(self.screen, color, rect, radius=5)

            # Draw eyes on the head
            if i == 0:
                self._draw_eyes(gx, gy)

    def _draw_eyes(self, gx: int, gy: int):
        """Draw two small eyes on the snake head based on direction."""
        offset_y = INFO_BAR_HEIGHT
        cx = gx * CELL_SIZE + CELL_SIZE // 2
        cy = gy * CELL_SIZE + offset_y + CELL_SIZE // 2
        dx, dy = self.direction
        eye_offset = 4
        eye_radius = 3
        pupil_radius = 1

        if self.direction in (LEFT, RIGHT):
            # Eyes are top and bottom
            e1 = (cx + dx * 4, cy - eye_offset)
            e2 = (cx + dx * 4, cy + eye_offset)
        else:
            # Eyes are left and right
            e1 = (cx - eye_offset, cy + dy * 4)
            e2 = (cx + eye_offset, cy + dy * 4)

        for ex, ey in (e1, e2):
            pygame.draw.circle(self.screen, (255, 255, 255), (ex, ey), eye_radius)
            pygame.draw.circle(self.screen, (0, 0, 0), (ex + dx, ey + dy), pupil_radius)

    def _draw_food(self):
        """Draw the food item with a glow effect."""
        offset_y = INFO_BAR_HEIGHT
        gx, gy = self.food
        center = (gx * CELL_SIZE + CELL_SIZE // 2, gy * CELL_SIZE + offset_y + CELL_SIZE // 2)

        # Outer glow
        pygame.draw.circle(self.screen, COLOR_FOOD, center, CELL_SIZE // 2 - 1)
        # Inner highlight
        pygame.draw.circle(self.screen, COLOR_FOOD_GLOW, center, CELL_SIZE // 4)

    def _draw_info_bar(self):
        """Draw the top info bar with score and controls hint."""
        bar_rect = pygame.Rect(0, 0, WINDOW_WIDTH, INFO_BAR_HEIGHT)
        pygame.draw.rect(self.screen, COLOR_INFO_BG, bar_rect)
        pygame.draw.line(self.screen, COLOR_BORDER, (0, INFO_BAR_HEIGHT), (WINDOW_WIDTH, INFO_BAR_HEIGHT))

        # Score
        score_text = self.font_small.render(f"Score: {self.score}", True, COLOR_TEXT)
        self.screen.blit(score_text, (12, 10))

        # High score
        hi_text = self.font_small.render(f"Best: {self.high_score}", True, COLOR_TEXT)
        self.screen.blit(hi_text, (160, 10))

        # Controls hint
        hint_text = self.font_info.render("WASD/Arrows  P=Pause  ESC=Quit", True, (100, 100, 140))
        self.screen.blit(hint_text, (WINDOW_WIDTH - hint_text.get_width() - 12, 12))

    def _draw_border(self):
        """Draw a border around the play area."""
        play_rect = pygame.Rect(0, INFO_BAR_HEIGHT, SCREEN_WIDTH, SCREEN_HEIGHT)
        pygame.draw.rect(self.screen, COLOR_BORDER, play_rect, width=2)

    def _draw_overlay(self, title: str, subtitle: str, title_color: tuple):
        """Draw a semi-transparent overlay with centered text."""
        overlay = pygame.Surface((WINDOW_WIDTH, WINDOW_HEIGHT), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 150))
        self.screen.blit(overlay, (0, 0))

        # Title
        title_surf = self.font_big.render(title, True, title_color)
        title_rect = title_surf.get_rect(center=(WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2 - 20))
        self.screen.blit(title_surf, title_rect)

        # Subtitle
        sub_surf = self.font_small.render(subtitle, True, COLOR_TEXT)
        sub_rect = sub_surf.get_rect(center=(WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2 + 20))
        self.screen.blit(sub_surf, sub_rect)

    # ----- Main loop -------------------------------------------------------

    def run(self):
        """Start the main game loop."""
        while True:
            self.handle_events()
            self.update()
            self.draw()
            self.clock.tick(FPS)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    game = SnakeGame()
    game.run()
