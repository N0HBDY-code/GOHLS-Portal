import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlayerManager } from './player-manager';

describe('PlayerManager', () => {
  let component: PlayerManager;
  let fixture: ComponentFixture<PlayerManager>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlayerManager]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlayerManager);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
